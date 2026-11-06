"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { CommandError, type ActionResult } from "@/lib/domain/commands";
import { CSV_LIMITS, csvMappingSchema, mapCsv, readCsv, type IntakeBinding } from "@/lib/domain/imports";
import { stageIntakeBatch, reviewIntake, confirmSelectedIntake } from "@/lib/server/intake";
import { readXlsx } from "@/lib/domain/xlsx";
import { applyReader, labelRows, suggestAutoFields, suggestColumns } from "@/lib/domain/reader";
import { requireActor } from "@/lib/server/auth";
import { getWorkspace } from "@/lib/server/workspace";
import { createClient } from "@/lib/supabase/server";

async function perform<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await operation() }; }
  catch (error) {
    unstable_rethrow(error);
    const failure = error instanceof CommandError ? error : new CommandError("SERVICE_UNAVAILABLE");
    return { ok: false, code: failure.code, message: Object.values(failure.fieldErrors ?? {})[0] ?? failure.message, fieldErrors: failure.fieldErrors };
  }
}

async function csvFile(form: FormData) {
  await requireActor();
  const file = form.get("file");
  if (!(file instanceof File) || !/\.(csv|xlsx)$/i.test(file.name) || file.size > CSV_LIMITS.bytes || !file.size)
    throw new CommandError("VALIDATION_ERROR", { file: "Choose a .csv or .xlsx file up to 512 KiB." });
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      const sheet = form.get("sheet");
      if (sheet !== null && (typeof sheet !== "string" || !sheet || sheet.length > 200)) throw new Error("Select a worksheet.");
      const workbook = await readXlsx(bytes, typeof sheet === "string" ? sheet : undefined);
      return { file, bytes, csv: workbook.file, sheets: workbook.sheets, sheet: workbook.sheet };
    }
    return { file, bytes, csv: readCsv(bytes), sheets: [] as string[], sheet: null };
  } catch (error) {
    throw new CommandError("VALIDATION_ERROR", { file: error instanceof Error ? error.message : "Check the spreadsheet file." });
  }
}

export async function inspectCsvAction(form: FormData) {
  return perform(async () => {
    const { csv, sheets, sheet } = await csvFile(form);
    // The reader's suggestions and labels are hints for the selector; the saved mapping is validated again on preview and staging.
    const suggestions = csv ? suggestColumns(csv.headers, csv.rows.slice(0, 20)) : [];
    const fields = suggestAutoFields(suggestions);
    const labels = csv ? labelRows(csv, { externalId: fields.externalId ?? "", amount: fields.amount ?? "", overrides: {}, ...fields }).slice(0, 100) : [];
    return { headers: csv?.headers ?? [], sample: csv?.rows.slice(0, 3) ?? [], rows: csv?.rows.slice(0, 100) ?? [], count: csv?.rows.length ?? 0, sheets, sheet, fields, labels };
  });
}

async function prepareCsv(form: FormData) {
  const { file, bytes, csv, sheet } = await csvFile(form);
  if (!csv) throw new CommandError("VALIDATION_ERROR", { sheet: "Select a worksheet and read its columns first." });
  let mapping;
  const raw = form.get("mapping");
  const sourceId = form.get("sourceId");
  if (typeof raw !== "string" || raw.length > 10_000 || !z.uuid().safeParse(sourceId).success) throw new CommandError("VALIDATION_ERROR");
  try { mapping = csvMappingSchema.parse(JSON.parse(raw)); } catch { throw new CommandError("VALIDATION_ERROR"); }
  const workspace = await getWorkspace();
  const client = await createClient();
  const index = csv.headers.indexOf(mapping.externalId);
  const bindings = await client.rpc("get_intake_bindings", { p_source_id: sourceId as string, p_external_ids: csv.rows.map(row => (row[index] ?? "").trim()) });
  if (bindings.error) throw CommandError.fromDatabase(bindings.error.message);
  const parsedBindings = z.array(z.strictObject({ externalId: z.string(), type: z.string(), recordId: z.uuid() })).safeParse(bindings.data);
  if (!parsedBindings.success) throw new CommandError("SERVICE_UNAVAILABLE");
  let rows, held = { payments: [] as number[], choose: [] as number[] };
  try {
    const context = { ...workspace, bindings: parsedBindings.data as IntakeBinding[] };
    if (mapping.kind === "auto") {
      const read = applyReader(csv, mapping);
      held = { payments: read.payments, choose: read.choose };
      rows = mapCsv(read.file, read.mixed, context);
    } else rows = mapCsv(csv, mapping, context);
  }
  catch (error) { throw new CommandError("VALIDATION_ERROR", { mapping: error instanceof Error ? error.message : "Check the column mapping." }); }
  return { file, bytes, mapping, rows, held, sheet, sourceId: sourceId as string };
}

export async function previewCsvAction(form: FormData) {
  return perform(async () => { const { rows, held } = await prepareCsv(form); return { rows, held }; });
}

export async function stageCsvAction(form: FormData) {
  return perform(async () => {
    const { file, bytes, mapping, rows, sheet, sourceId } = await prepareCsv(form);
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const proposals = rows.filter(row => row.candidate && row.status !== "invalid" && row.status !== "duplicate").map(row => {
      const candidate = structuredClone(row.candidate!);
      // Bindings are resolved again in SQL; only an explicit mapped record ID belongs to the source payload.
      if (!mapping.recordId || !row.fields[mapping.recordId]?.trim()) delete candidate.payload.id;
      return { externalId: row.externalId, sourceVersion: createHash("sha256").update(JSON.stringify(candidate)).digest("hex"), candidate,
        evidence: { filename: file.name.slice(0, 200), fileHash, ...(sheet ? { sheet } : {}), row: row.row, fields: row.fields } };
    });
    if (!proposals.length) throw new CommandError("VALIDATION_ERROR");
    const results = await stageIntakeBatch(sourceId, proposals);
    revalidatePath("/(workspace)", "layout");
    return results;
  });
}

// One spreadsheet source accepts both CSV and XLSX uploads, so repeat protection keyed on the
// source carries across formats; existing manual_xlsx sources remain selectable.
export async function createCsvSourceAction(label: string) {
  return perform(async () => {
    const actor = await requireActor();
    if (actor.role !== "owner") throw new CommandError("FORBIDDEN");
    const parsed = z.string().trim().min(1).max(200).safeParse(label);
    if (!parsed.success) throw new CommandError("VALIDATION_ERROR");
    const client = await createClient();
    const { data, error } = await client.rpc("create_intake_source", { p_kind: "manual_csv", p_label: parsed.data });
    if (error) throw CommandError.fromDatabase(error.message);
    revalidatePath("/imports");
    return data;
  });
}

export async function reviewIntakeAction(input: unknown) {
  return perform(async () => { const result = await reviewIntake(input); revalidatePath("/(workspace)", "layout"); return result; });
}

export async function confirmSelectedIntakeAction(input: unknown) {
  return perform(async () => {
    const result = await confirmSelectedIntake(input);
    revalidatePath("/(workspace)", "layout");
    return result;
  });
}
