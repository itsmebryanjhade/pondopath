import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseIntakeCandidate } from "@/lib/domain/intake";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), source: {} as Record<string, unknown>, tables: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: state.rpc,
  from: (table: string) => {
    const filters: [string, unknown][] = [];
    let start = 0, end = Infinity;
    const query = {
      select: () => query, order: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      range: (a: number, b: number) => { start = a; end = b; return query; },
      then: (resolve: (value: object) => unknown) => Promise.resolve(resolve({ data: (state.tables[table] ?? []).filter(row => filters.every(([key, value]) => row[key] === value)).slice(start, end + 1), error: null })),
    };
    return query;
  },
}) }));
import { candidateFingerprint, ingestConnectorRead } from "./connector-intake";
const businessId = "10000000-0000-4000-8000-000000000001";
const sourceId = "20000000-0000-4000-8000-000000000001";
const customerId = "30000000-0000-4000-8000-000000000001";
const key = "fictional-connector-key-with-32-bytes-long";
const headers = ["ID", "Invoice", "Amount", "Due", "Include"];
const mapping = { kind: "invoice", externalId: "ID", number: "Invoice", amount: "Amount", dueDate: "Due", customerId };
const read = (ids = ["a"]) => ({ runId: "read-1", headers, rows: ids.map(id => [id, "GS-" + id, 12.5, 46346, true]), rowNumbers: ids.map((_, i) => i + 2) });
const candidate = (id: string) => parseIntakeCandidate({ type: "save_invoice", payload: { customerId, number: "GS-" + id, amountCents: 1250, dueDate: "2026-11-20" } });
function saved(id: string, status = "pending"): Record<string, unknown> {
  const value = candidate(id);
  return { id: id + "-item", business_id: businessId, source_id: sourceId, external_id: id, source_version: createHash("sha256").update(JSON.stringify(value)).digest("hex"), status, candidate: value, outcome: null, observed_at: "2026-11-06T00:00:00Z" };
}
const stagedRun = () => state.rpc.mock.calls.find(call => call[0] === "connector_ingest")?.[1].p_run;
beforeEach(() => {
  vi.resetAllMocks();
  state.source = { businessId, status: "active", mapping, settings: {}, connectedBy: "40000000-0000-4000-8000-000000000001" };
  state.tables = { customers: [{ id: customerId, business_id: businessId }], invoices: [], expenses: [], intake_items: [], intake_sources: [{ id: sourceId, business_id: businessId, last_run_summary: null }], intake_connector_runs: [] };
  state.rpc.mockImplementation(async (name: string, args: { p_run?: { result: string; counts: object; errorCode?: string; rows?: { externalId: string }[] } }) => {
    if (name === "connector_source") return { data: state.source, error: null };
    if (name === "connector_ingest") return { data: { replayed: false, result: args.p_run!.result, counts: args.p_run!.counts, errorCode: args.p_run!.errorCode ?? null, results: (args.p_run!.rows ?? []).map(row => ({ externalId: row.externalId, itemId: "50000000-0000-4000-8000-000000000001", status: "pending", replayed: false })) }, error: null };
    throw new Error("Unexpected RPC: " + name);
  });
});
describe("scoped connector intake", () => {
  it("stores headers and samples on the first read and stages nothing", async () => {
    state.source.status = "awaiting_first_read";
    expect(await ingestConnectorRead(sourceId, key, read())).toMatchObject({ result: "first_read", read: 1, staged: 0 });
    expect(stagedRun()).toMatchObject({ firstRead: { headers, samples: [["a", "GS-a", 12.5, 46346, true]] } });
    expect(stagedRun().rows).toBeUndefined();
  });
  it("stages only new and changed rows by fingerprint with literal amounts, dates and provenance", async () => {
    state.tables.intake_items.push(saved("a"));
    const result = await ingestConnectorRead(sourceId, key, read(["a", "b", "c"]));
    expect(result).toMatchObject({ staged: 2, unchanged: 1, read: 3 });
    expect(stagedRun().rows.map((row: { externalId: string }) => row.externalId)).toEqual(["b", "c"]);
    expect(stagedRun().rows[0]).toMatchObject({ candidate: { type: "save_invoice", payload: { number: "GS-b", amountCents: 1250, dueDate: "2026-11-20", customerId } }, evidence: { via: "google_sheet_connector", runId: "read-1", sheetRow: 3 } });
    expect(state.rpc.mock.calls.some(call => call[0] === "get_intake_bindings")).toBe(false);
  });
  it("ignores reordered rows and handles inserted rows independently", async () => {
    state.tables.intake_items.push(saved("a"), saved("b"));
    expect(await ingestConnectorRead(sourceId, key, read(["b", "new", "a"]))).toMatchObject({ staged: 1, unchanged: 2 });
    expect(stagedRun().rows[0].externalId).toBe("new");
  });
  it("counts rows missing since the last successful read without deleting anything", async () => {
    state.tables.intake_sources[0].last_run_summary = { counts: { seen: ["a", "b"].map(id => createHash("sha256").update(id).digest("base64url")) } };
    expect(await ingestConnectorRead(sourceId, key, read(["b"]))).toMatchObject({ missing: 1 });
    expect(stagedRun().counts.seen).toHaveLength(1);
    expect(JSON.stringify(stagedRun().counts.seen)).not.toContain('"b"');
  });
  it("fails the whole read when a mapped header is missing", async () => {
    const input = read(); input.headers = ["ID", "Renamed", "Amount", "Due", "Include"];
    expect(await ingestConnectorRead(sourceId, key, input)).toMatchObject({ result: "failed", staged: 0, errorCode: "MAPPING_HEADER_MISSING" });
    expect(stagedRun().rows).toBeUndefined();
  });
  it("stages at most 100 rows and advances through the rest on the next read", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i));
    expect(await ingestConnectorRead(sourceId, key, read(ids))).toMatchObject({ staged: 100, morePending: true });
    state.tables.intake_items.push(...ids.slice(0, 100).map(id => saved(id)));
    state.rpc.mockClear();
    expect(await ingestConnectorRead(sourceId, key, { ...read(ids), runId: "read-2" })).toMatchObject({ staged: 50, unchanged: 100, morePending: false });
  });
  it("records paused reads and upstream errors without staging", async () => {
    state.source.status = "paused";
    expect(await ingestConnectorRead(sourceId, key, read())).toMatchObject({ result: "paused", staged: 0 });
    expect(stagedRun().rows).toBeUndefined();
    state.rpc.mockClear(); state.source.status = "active";
    expect(await ingestConnectorRead(sourceId, key, { runId: "failed", error: "SHEET_ACCESS_DENIED" })).toMatchObject({ result: "failed", errorCode: "SHEET_ACCESS_DENIED" });
    expect(stagedRun().rows).toBeUndefined();
  });
  it("accepts checkboxes only as Type/filter values and isolates invalid identifier and value rows", async () => {
    state.source.mapping = { kind: "expense", externalId: "ID", label: "Invoice", payee: "Include", amount: "Amount", dueDate: "Due" };
    const result = await ingestConnectorRead(sourceId, key, read());
    expect(result.invalid).toEqual([{ row: 2, reason: "Use text, not a checkbox, in Payee." }]);
    state.source.mapping = { ...mapping, filter: { column: "Include", value: "TRUE" } };
    expect(await ingestConnectorRead(sourceId, key, read())).toMatchObject({ staged: 1, invalid: [] });
    const input = read(["a", "b"]); input.rows[0][0] = 42; input.rows[1][2] = "private-invalid-amount";
    const invalid = await ingestConnectorRead(sourceId, key, input);
    expect(invalid.invalid).toHaveLength(2);
    expect(JSON.stringify(invalid)).not.toContain("private-invalid-amount");
  });
  it("resolves applied bindings by source and business, without putting inferred IDs into fingerprints", async () => {
    const item = saved("a", "applied");
    item.outcome = { recordId: "60000000-0000-4000-8000-000000000001" };
    state.tables.intake_items.push(item);
    state.tables.invoices.push({ id: "60000000-0000-4000-8000-000000000001", business_id: businessId, number: "GS-a", customer_id: customerId, amount_cents: 1000, due_date: "2026-11-20" });
    const input = read(); input.rows[0][2] = 13;
    expect(await ingestConnectorRead(sourceId, key, input)).toMatchObject({ staged: 1 });
    expect(stagedRun().rows[0].candidate.payload.id).toBeUndefined();
    expect(candidateFingerprint(candidate("a"))).toBe(saved("a").source_version);
  });
  it("uses stored canonical counts on run replay and on a database pause race", async () => {
    state.rpc.mockImplementation(async (name: string) => name === "connector_source" ? { data: state.source, error: null } : { data: { replayed: true, result: "paused", counts: { read: 1, staged: 0, unchanged: 0, skippedByFilter: 0, invalid: [], missing: 0, morePending: false }, results: [] }, error: null });
    expect(await ingestConnectorRead(sourceId, key, read())).toMatchObject({ result: "paused", staged: 0, replayed: true });
  });

  it("continues after a date serial outside the Date range and keeps 500 invalid rows within the saved-summary bound", async () => {
    const input = read(["a", "b"]); input.rows[0][3] = 1e100;
    expect(await ingestConnectorRead(sourceId, key, input)).toMatchObject({ staged: 1, invalid: [{ row: 2 }] });
    const many = read(Array.from({ length: 500 }, (_, i) => String(i)));
    many.rows.forEach((row, i) => { row[0] = i; });
    expect((await ingestConnectorRead(sourceId, key, many)).invalid).toHaveLength(500);
    const run = state.rpc.mock.calls.filter(call => call[0] === "connector_ingest").at(-1)![1].p_run;
    expect(Buffer.byteLength(JSON.stringify(run.counts))).toBeLessThanOrEqual(65536);
  });
  it("reads beyond the first database page and excludes other businesses", async () => {
    state.tables.intake_items.push(...Array.from({ length: 1000 }, (_, i) => saved("older-" + i)), saved("a"));
    state.tables.customers.push({ id: "70000000-0000-4000-8000-000000000001", business_id: "80000000-0000-4000-8000-000000000001" });
    expect(await ingestConnectorRead(sourceId, key, read())).toMatchObject({ staged: 0, unchanged: 1 });
  });
  it("does not attach a new mapping error to a successful prior run replay", async () => {
    state.source.mapping = { ...mapping, number: "Renamed" };
    state.rpc.mockImplementation(async (name: string) => name === "connector_source" ? { data: state.source, error: null } : { data: { replayed: true, result: "staged", counts: { read: 1, staged: 1, unchanged: 0, skippedByFilter: 0, invalid: [], missing: 0, morePending: false }, errorCode: null }, error: null });
    expect(await ingestConnectorRead(sourceId, key, read())).not.toHaveProperty("errorCode");
  });
});
