import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectorReadSchema, normalizeConnectorRows, CONNECTOR_LIMITS, type ConnectorRead } from "@/lib/domain/connector-rows";
import { csvMappingSchema, mapCsv, type CsvMapping, type IntakeBinding } from "@/lib/domain/imports";
import type { IntakeCandidate } from "@/lib/domain/intake";
import type { Json } from "@/lib/database.types";

const resultSchema = z.enum(["staged", "paused", "awaiting_mapping", "failed", "first_read"]);
const countsSchema = z.object({
  read: z.number().int().min(0).max(500), staged: z.number().int().min(0).max(100),
  unchanged: z.number().int().min(0).max(500), skippedByFilter: z.number().int().min(0).max(500),
  invalid: z.array(z.object({ row: z.number().int().positive(), reason: z.string().max(50) })).max(500),
  missing: z.number().int().min(0).max(500), morePending: z.boolean(),
});
export type ConnectorRunSummary = z.infer<typeof countsSchema> & { result: z.infer<typeof resultSchema>; replayed: boolean; errorCode?: string };
const sourceSchema = z.object({ businessId: z.uuid(), status: z.enum(["awaiting_first_read", "awaiting_mapping", "active", "paused"]), mapping: z.unknown(), settings: z.record(z.string(), z.unknown()) });
const fail = (): never => { throw new Error("CONNECTOR_UNAVAILABLE"); };
export const candidateFingerprint = (candidate: IntakeCandidate) => createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
const rowIdentity = (id: string) => createHash("sha256").update(id).digest("base64url");

// Paginate server reads: PostgREST otherwise silently returns only the first 1,000 records.
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error || !data) fail();
    rows.push(...data!);
    if (data!.length < 1000) return rows;
  }
}
function columns(mapping: CsvMapping): [string, string][] {
  return Object.entries(mapping).filter(([name, value]) => typeof value === "string" && !["kind", "customerId"].includes(name)) as [string, string][];
}
function safeReason(message: string) {
  if (message.startsWith("Store identifiers")) return "Store identifiers as text in the Sheet.";
  if (message.startsWith("Unknown type")) return "Unknown Type value.";
  if (message.startsWith("Repeated source")) return "Repeated source ID or record.";
  if (message.startsWith("Only PHP")) return "Only PHP amounts are supported.";
  if (message.startsWith("This source ID")) return "This source ID belongs to another record kind.";
  return "Check this row's amount, date and mapped values.";
}

export async function ingestConnectorRead(sourceId: string, key: string, input: ConnectorRead): Promise<ConnectorRunSummary> {
  if (!z.uuid().safeParse(sourceId).success || !/^[A-Za-z0-9_-]{32,200}$/.test(key)) throw new Error("UNAUTHENTICATED");
  const client = createAdminClient();
  const sourceResult = await client.rpc("connector_source", { p_source_id: sourceId, p_key: key });
  if (sourceResult.error?.message === "UNAUTHENTICATED") throw new Error("UNAUTHENTICATED");
  const parsedSource = sourceSchema.safeParse(sourceResult.data);
  if (sourceResult.error || !parsedSource.success) fail();
  const source = parsedSource.data!;
  const parsedRead = connectorReadSchema.safeParse(input);
  if (!parsedRead.success) throw new Error("INVALID_REQUEST");
  const read = parsedRead.data;
  const summary: ConnectorRunSummary = { result: "staged", read: "rows" in read ? read.rows.length : 0, staged: 0, unchanged: 0, skippedByFilter: 0, invalid: [], missing: 0, morePending: false, replayed: false };
  const previous = await client.from("intake_sources").select("last_run_summary").eq("business_id", source.businessId).eq("id", sourceId).range(0, 0);
  if (previous.error) fail();
  const previousCounts = z.object({ counts: z.object({ seen: z.array(z.string()).max(500) }) }).safeParse(previous.data?.[0]?.last_run_summary);
  let seen = previousCounts.success ? previousCounts.data.counts.seen : [];
  type StagedRow = { externalId: string; sourceVersion: string; candidate: IntakeCandidate; evidence: { via: string; runId: string; sheetRow: number; fields: Record<string, string> } };
  let rows: StagedRow[] | undefined;
  let firstRead: { headers: string[]; samples: (string | number | boolean | null)[][] } | undefined;
  if ("error" in read) { summary.result = "failed"; summary.errorCode = read.error; }
  else if (source.status === "paused") summary.result = "paused";
  else {
    let file: ReturnType<typeof normalizeConnectorRows> | undefined;
    try { file = normalizeConnectorRows(read, { dateColumns: [] }); }
    catch { summary.result = "failed"; summary.errorCode = "INVALID_SHEET"; }
    if (file && ["awaiting_first_read", "awaiting_mapping"].includes(source.status)) {
      summary.result = source.status === "awaiting_first_read" ? "first_read" : "awaiting_mapping";
      firstRead = { headers: file.headers, samples: [] };
      for (const values of read.rows.slice(0, 5)) {
        if (Buffer.byteLength(JSON.stringify({ ...firstRead, samples: [...firstRead.samples, values] })) > 24_576) break;
        firstRead.samples.push(values);
      }
      // Repeated reads while waiting for mapping may refresh the same bounded header/sample capture.
      summary.result = "first_read";
    } else if (file) {
      const parsedMapping = csvMappingSchema.safeParse(source.mapping);
      if (!parsedMapping.success) { summary.result = "failed"; summary.errorCode = "INVALID_MAPPING"; }
      else {
        const mapping = parsedMapping.data;
        const mapped = columns(mapping);
        const required = [...mapped.map(([, header]) => header), ...(mapping.filter ? [mapping.filter.column] : [])];
        if (required.some(header => !file!.headers.includes(header))) {
          summary.result = "failed"; summary.errorCode = "MAPPING_HEADER_MISSING";
        } else {
          file = normalizeConnectorRows(read, { dateColumns: [mapping.dueDate] });
          const [customers, invoices, expenses, items] = await Promise.all([
            all((a, b) => client.from("customers").select("id").eq("business_id", source.businessId).order("id").range(a, b)),
            all((a, b) => client.from("invoices").select("id,number,customer_id,amount_cents,due_date").eq("business_id", source.businessId).order("id").range(a, b)),
            all((a, b) => client.from("expenses").select("id,label,payee,amount_cents,due_date").eq("business_id", source.businessId).order("id").range(a, b)),
            all((a, b) => client.from("intake_items").select("external_id,source_version,status,candidate,outcome").eq("business_id", source.businessId).eq("source_id", sourceId).order("observed_at", { ascending: false }).order("id", { ascending: false }).range(a, b)),
          ]);
          const bindings = new Map<string, IntakeBinding>();
          for (const item of items) if (item.status === "applied" && !bindings.has(item.external_id)) {
            const value = z.object({ type: z.string() }).safeParse(item.candidate);
            const outcome = z.object({ recordId: z.uuid() }).safeParse(item.outcome);
            if (!value.success || !outcome.success) fail();
            bindings.set(item.external_id, { externalId: item.external_id, type: value.data!.type, recordId: outcome.data!.recordId });
          }
          const existing = new Set(items.map(item => JSON.stringify([item.external_id, item.source_version])));
          const present = new Set(file.rows.map(values => values[file!.headers.indexOf(mapping.externalId)]?.trim()).filter(Boolean).map(id => rowIdentity(id!)));
          summary.missing = seen.filter(id => !present.has(id)).length;
          seen = [...present];
          const proposals = mapCsv(file, mapping, { customers, invoices, expenses, bindings: [...bindings.values()] });
          const labels: Record<string, string> = { externalId: "Row ID", recordId: "Record ID", number: "Invoice number", amount: "Amount", dueDate: "Due date", customer: "Customer", label: "Label", payee: "Payee", currency: "Currency" };
          rows = [];
          for (const [index, proposal] of proposals.entries()) {
            if (proposal.status === "filtered") { summary.skippedByFilter++; continue; }
            const checkbox = mapped.find(([field, header]) => field !== "typeColumn" && file!.booleanCells[index]?.[file!.headers.indexOf(header)]);
            if (checkbox || !proposal.candidate || ["invalid", "duplicate"].includes(proposal.status)) {
              summary.invalid.push({ row: proposal.row, reason: checkbox ? "Use text, not a checkbox, in " + labels[checkbox[0]] + "." : safeReason(proposal.message) });
              continue;
            }
            const value = structuredClone(proposal.candidate);
            if (!mapping.recordId || !proposal.fields[mapping.recordId]?.trim()) delete value.payload.id;
            const fingerprint = candidateFingerprint(value);
            if (existing.has(JSON.stringify([proposal.externalId, fingerprint])) || proposal.status === "unchanged") { summary.unchanged++; continue; }
            if (rows.length === CONNECTOR_LIMITS.stagedPerRead) { summary.morePending = true; continue; }
            rows.push({ externalId: proposal.externalId, sourceVersion: fingerprint, candidate: value, evidence: { via: "google_sheet_connector", runId: read.runId, sheetRow: proposal.row, fields: proposal.fields } });
          }
          summary.staged = rows.length;
        }
      }
    }
  }
  const counts = { read: summary.read, staged: summary.staged, unchanged: summary.unchanged, skippedByFilter: summary.skippedByFilter, invalid: summary.invalid, missing: summary.missing, morePending: summary.morePending, seen };
  const result = await client.rpc("connector_ingest", { p_source_id: sourceId, p_key: key, p_run: {
    runId: read.runId, result: summary.result, counts, ...(summary.errorCode ? { errorCode: summary.errorCode } : {}), ...(firstRead ? { firstRead } : {}), ...(rows?.length ? { rows } : {}),
  } as unknown as Json });
  if (result.error?.message === "UNAUTHENTICATED") throw new Error("UNAUTHENTICATED");
  const canonical = z.object({ replayed: z.boolean(), result: resultSchema, counts: countsSchema, errorCode: z.string().nullable().optional() }).safeParse(result.data);
  if (result.error || !canonical.success) fail();
  return { ...canonical.data!.counts, result: canonical.data!.result, replayed: canonical.data!.replayed, ...(canonical.data!.errorCode ? { errorCode: canonical.data!.errorCode } : {}) };
}
