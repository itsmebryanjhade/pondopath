import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readXlsx } from "../../lib/domain/xlsx";
import { readCsv, mapCsv, type CsvMapping } from "../../lib/domain/imports";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";
vi.mock("server-only", () => ({}));
const bulkSession = vi.hoisted(() => ({ rpc: vi.fn(), actor: { userId: "", businessId: "", role: "finance" } }));
vi.mock("../../lib/server/auth", () => ({ requireActor: async () => bulkSession.actor }));
vi.mock("../../lib/supabase/server", () => ({ createClient: async () => ({ rpc: bulkSession.rpc }) }));
import { confirmSelectedIntake } from "../../lib/server/intake";


describe("review intake boundary", () => {
  let business: TestBusiness;
  let other: TestBusiness;
  let owner: SupabaseClient;
  let finance: SupabaseClient;
  let otherOwner: SupabaseClient;
  let sourceId: string;

  const invoice = (customerId: string, amountCents = 20_000) => ({
    type: "save_invoice", payload: { number: "IMPORTED-001", customerId, amountCents, dueDate: "2026-11-05" },
  });

  beforeAll(async () => {
    business = await createTestBusiness();
    other = await createTestBusiness();
    owner = await signInAs(business.accounts.owner);
    finance = await signInAs(business.accounts.finance);
    otherOwner = await signInAs(other.accounts.owner);
    const source = await owner.rpc("create_intake_source", { p_kind: "manual_csv", p_label: "Fictional CSV" });
    if (source.error) throw source.error;
    sourceId = source.data as string;
  });

  afterAll(async () => {
    await owner?.auth.signOut();
    await finance?.auth.signOut();
    await otherOwner?.auth.signOut();
    if (other) await disposeTestBusiness(other);
    if (business) await disposeTestBusiness(business);
  });

  it("restricts source configuration and staged rows to the business", async () => {
    expect((await finance.rpc("create_intake_source", { p_kind: "manual_csv", p_label: "Denied" })).error).not.toBeNull();
    expect((await otherOwner.rpc("stage_intake", {
      p_source_id: sourceId, p_external_id: "x", p_source_version: "1", p_candidate: invoice(other.customerId),
    })).error).not.toBeNull();
    expect((await otherOwner.from("intake_sources").select("id").eq("id", sourceId)).data).toEqual([]);
    expect((await otherOwner.from("intake_items").select("id")).data).toEqual([]);
  });

  it("stages once without posting cash, then applies once through the authorized command", async () => {
    const candidate = invoice(business.customerId);
    const input = { p_source_id: sourceId, p_external_id: "row-1", p_source_version: "1", p_candidate: candidate };
    const first = await finance.rpc("stage_intake", input);
    expect(first.error).toBeNull();
    const repeated = await finance.rpc("stage_intake", input);
    expect(repeated.error).toBeNull();
    expect(repeated.data).toBe(first.data);
    expect((await finance.rpc("stage_intake", { ...input, p_candidate: invoice(business.customerId, 30_000) })).error).not.toBeNull();
    expect((await owner.rpc("workspace_snapshot")).data.forecastInput.availableCents).toBe(4_000_000);
    const item = await owner.from("intake_items").select("*").eq("id", first.data).single();
    expect(item.data).toMatchObject({ status: "pending", source_version: "1", review_version: 1, staged_by: business.accounts.finance.id });
    expect(item.data.original_content).toEqual(candidate);
    const applied = await finance.rpc("apply_intake", { p_item_id: first.data, p_review_version: 1, p_expected_revision: 0 });
    expect(applied.error).toBeNull();
    expect(applied.data).toMatchObject({ revision: 1, replayed: false });
    const retry = await finance.rpc("apply_intake", { p_item_id: first.data, p_review_version: 1, p_expected_revision: 0 });
    expect(retry.error).toBeNull();
    expect(retry.data).toMatchObject({ recordId: applied.data.recordId, revision: 1, replayed: true });
    expect((await admin.from("invoices").select("id").eq("business_id", business.id).eq("number", "IMPORTED-001")).data).toHaveLength(1);
    expect((await admin.from("command_receipts").select("request_id").eq("business_id", business.id).eq("request_id", first.data)).data).toHaveLength(1);
  });

  it("holds changed versions and rejects stale review or record changes", async () => {
    const unchanged = await finance.rpc("stage_intake", {
      p_source_id: sourceId, p_external_id: "row-1", p_source_version: "unchanged",
      p_candidate: invoice(business.customerId),
    });
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toBeNull();
    const obsolete = await finance.rpc("stage_intake", {
      p_source_id: sourceId, p_external_id: "row-2", p_source_version: "1",
      p_candidate: invoice(business.customerId, 30_000),
    });
    expect(obsolete.error).toBeNull();
    expect((await finance.rpc("stage_intake", {
      p_source_id: sourceId, p_external_id: "row-2", p_source_version: "2",
      p_candidate: invoice(business.customerId),
    })).data).toBeNull();
    expect((await owner.from("intake_items").select("status").eq("id", obsolete.data).single()).data?.status).toBe("superseded");
    const second = await finance.rpc("stage_intake", {
      p_source_id: sourceId, p_external_id: "row-1", p_source_version: "2", p_candidate: invoice(business.customerId, 30_000),
    });
    expect(second.error).toBeNull();
    expect((await finance.rpc("apply_intake", { p_item_id: second.data, p_review_version: 2, p_expected_revision: 1 })).error).not.toBeNull();
    const staged = await owner.from("intake_items").select("matched_record_id").eq("id", second.data).single();
    expect(staged.data?.matched_record_id).toBeTruthy();
    const change = await owner.rpc("workspace_command", { p_command: {
      requestId: randomUUID(), expectedRevision: 1, type: "save_invoice",
      payload: { id: staged.data?.matched_record_id, number: "IMPORTED-001", customerId: business.customerId, amountCents: 25_000, dueDate: "2026-11-05" },
    } });
    expect(change.error).toBeNull();
    expect((await finance.rpc("apply_intake", { p_item_id: second.data, p_review_version: 1, p_expected_revision: 2 })).error).not.toBeNull();
    const item = await owner.from("intake_items").select("status").eq("id", second.data).single();
    expect(item.data?.status).toBe("pending");
  });

  it("blocks payment claims and ambiguous duplicate expenses", async () => {
    expect((await finance.rpc("stage_intake", {
      p_source_id: sourceId, p_external_id: "paid-claim", p_source_version: "1",
      p_candidate: { type: "post_cash_movement", payload: { kind: "receipt", parentId: business.invoiceId, amountCents: 100, date: "2026-10-29", reference: "claimed" } },
    })).error).not.toBeNull();
    expect((await finance.rpc("stage_intake", {
      p_source_id: sourceId, p_external_id: "source-reason", p_source_version: "1",
      p_candidate: { ...invoice(business.customerId), payload: { ...invoice(business.customerId).payload, reason: "Source approved it" } },
    })).error).not.toBeNull();
    const expense = { type: "save_expense", payload: { label: "Already entered", payee: "Supplier", amountCents: 2_000, dueDate: "2026-11-05" } };
    expect((await admin.from("expenses").insert({ business_id: business.id, label: expense.payload.label, payee: expense.payload.payee, amount_cents: expense.payload.amountCents, due_date: expense.payload.dueDate })).error).toBeNull();
    const staged = await finance.rpc("stage_intake", { p_source_id: sourceId, p_external_id: "expense-1", p_source_version: "1", p_candidate: expense });
    expect(staged.error).toBeNull();
    expect((await owner.from("intake_items").select("status").eq("id", staged.data).single()).data?.status).toBe("needs_match");
    expect((await finance.rpc("apply_intake", { p_item_id: staged.data, p_review_version: 1, p_expected_revision: 2 })).error).not.toBeNull();
    const clarified = await finance.rpc("review_intake", {
      p_item_id: staged.data, p_review_version: 1, p_decision: "clarify", p_reason: "Check whether this is the existing supplier bill.",
    });
    expect(clarified.error).toBeNull();
    expect(clarified.data).toBe(2);
    const rejected = await owner.rpc("review_intake", {
      p_item_id: staged.data, p_review_version: 2, p_decision: "reject", p_reason: "Already recorded manually.",
    });
    expect(rejected.error).toBeNull();
    expect((await owner.from("intake_items").select("status,review_note").eq("id", staged.data).single()).data)
      .toMatchObject({ status: "rejected", review_note: "Already recorded manually." });
  });

  it("amends and rebases a reviewed proposal without changing its source evidence", async () => {
    const raw = { type: "save_invoice", payload: { ...invoice(business.customerId).payload, number: "EDITABLE-CSV" } };
    const staged = await finance.rpc("stage_intake_batch", { p_source_id: sourceId, p_rows: [
      { externalId: "editable", sourceVersion: "1", candidate: raw, evidence: { filename: "fictional.csv", row: 2, fields: { Amount: "200.00" } } },
    ] });
    expect(staged.error).toBeNull();
    const itemId = staged.data?.[0]?.itemId;
    expect(itemId).toBeTruthy();
    expect((await otherOwner.rpc("amend_intake", { p_item_id: itemId, p_review_version: 1, p_expected_revision: 2, p_candidate: raw, p_note: "Cross-business attempt" })).error).not.toBeNull();
    const edited = { ...raw, payload: { ...raw.payload, amountCents: 35_000 } };
    const amended = await finance.rpc("amend_intake", { p_item_id: itemId, p_review_version: 1, p_expected_revision: 2, p_candidate: edited, p_note: "Checked the original invoice." });
    expect(amended.error).toBeNull();
    expect(amended.data).toBe(2);
    const stored = (await owner.from("intake_items").select("*").eq("id", itemId).single()).data;
    expect(stored).toMatchObject({ original_content: raw, candidate: edited, review_version: 2, source_evidence: { filename: "fictional.csv", row: 2 } });
    expect((await finance.rpc("apply_intake", { p_item_id: itemId, p_review_version: 1, p_expected_revision: 2 })).error).not.toBeNull();
    expect((await finance.rpc("apply_intake", { p_item_id: itemId, p_review_version: 2, p_expected_revision: 2 })).error).toBeNull();
  });

  it("keeps per-row batch results and binds changed expenses to the applied record", async () => {
    const expense = { type: "save_expense", payload: { label: "CSV first bill", payee: "Test vendor", amountCents: 10_000, dueDate: "2026-11-08" } };
    const rows = [{ externalId: "bound-expense", sourceVersion: "1", candidate: expense, evidence: { row: 2 } },
      { externalId: "invalid-row", sourceVersion: "1", candidate: { type: "post_cash_movement", payload: {} }, evidence: {} }];
    const staged = await finance.rpc("stage_intake_batch", { p_source_id: sourceId, p_rows: rows });
    expect(staged.error).toBeNull();
    expect(staged.data?.[0]).toMatchObject({ status: "pending" });
    expect(staged.data?.[1]).toMatchObject({ status: "error", code: "VALIDATION_ERROR" });
    const itemId = staged.data?.[0]?.itemId;
    const revision = (await owner.rpc("workspace_snapshot")).data.revision;
    const applied = await finance.rpc("apply_intake", { p_item_id: itemId, p_review_version: 1, p_expected_revision: revision });
    expect(applied.error).toBeNull();
    const retry = await finance.rpc("stage_intake_batch", { p_source_id: sourceId, p_rows: rows });
    expect(retry.data?.[0]).toMatchObject({ itemId, status: "applied", replayed: true });
    const changed = { ...expense, payload: { ...expense.payload, label: "CSV revised bill", amountCents: 12_000 } };
    const next = await finance.rpc("stage_intake", { p_source_id: sourceId, p_external_id: "bound-expense", p_source_version: "2", p_candidate: changed });
    expect(next.error).toBeNull();
    const item = (await owner.from("intake_items").select("matched_record_id,matched_version").eq("id", next.data).single()).data;
    expect(item?.matched_record_id).toBe(applied.data.recordId);
    const result = await finance.rpc("apply_intake", { p_item_id: next.data, p_review_version: 1, p_expected_revision: applied.data.revision });
    expect(result.error).toBeNull();
    expect(result.data.recordId).toBe(applied.data.recordId);
    expect((await admin.from("expenses").select("id").eq("business_id", business.id).eq("payee", "Test vendor")).data).toHaveLength(1);
    expect((await owner.rpc("workspace_snapshot")).data.forecastInput.availableCents).toBe(4_000_000);
  });
  it("supersedes an obsolete change when the source reverts to an already applied version", async () => {
    const original = { type: "save_invoice", payload: { ...invoice(business.customerId).payload, number: "REVERT-CSV" } };
    const input = { p_source_id: sourceId, p_external_id: "reverting-row", p_source_version: "content-A", p_candidate: original };
    const first = await finance.rpc("stage_intake", input);
    expect(first.error).toBeNull();
    const revision = (await owner.rpc("workspace_snapshot")).data.revision;
    const applied = await finance.rpc("apply_intake", { p_item_id: first.data, p_review_version: 1, p_expected_revision: revision });
    expect(applied.error).toBeNull();
    const change = await finance.rpc("stage_intake", { ...input, p_source_version: "content-B", p_candidate: { ...original, payload: { ...original.payload, amountCents: 50_000 } } });
    expect(change.error).toBeNull();
    expect((await finance.rpc("stage_intake", input)).data).toBe(first.data);
    expect((await owner.from("intake_items").select("status").eq("id", change.data).single()).data?.status).toBe("superseded");
    expect((await finance.rpc("apply_intake", { p_item_id: change.data, p_review_version: 1, p_expected_revision: applied.data.revision })).error).not.toBeNull();
  });
  it("replays the same reviewed source row across CSV and XLSX without a second invoice or cash write", async () => {
    const mapping: CsvMapping = { kind: "invoice", externalId: "Source ID", number: "Invoice number", amount: "Amount PHP", dueDate: "Original due", customerId: business.customerId, currency: "Currency" };
    const context = { customers: [{ id: business.customerId }], invoices: [], expenses: [], bindings: [] };
    const workbook = await readXlsx(readFileSync("public/samples/pondopath-invoices.xlsx"), "Invoices");
    const csvCandidate = mapCsv(readCsv(readFileSync("public/samples/pondopath-invoices.csv")), mapping, context)[0].candidate!;
    const excelCandidate = mapCsv(workbook.file!, mapping, context)[0].candidate!;
    expect(excelCandidate).toEqual(csvCandidate);
    expect(excelCandidate.payload).toMatchObject({ amountCents: 1_250_000, dueDate: "2026-11-10" });
    const source = await owner.rpc("create_intake_source", { p_kind: "manual_csv", p_label: "CSV and XLSX replay proof" });
    expect(source.error).toBeNull();
    const row = (candidate: typeof csvCandidate, filename: string) => ({
      externalId: "sample-001", sourceVersion: createHash("sha256").update(JSON.stringify(candidate)).digest("hex"),
      candidate, evidence: { filename, row: 2 },
    });
    const before = (await owner.rpc("workspace_snapshot")).data;
    const first = await finance.rpc("stage_intake_batch", { p_source_id: source.data, p_rows: [row(csvCandidate, "fictional.csv")] });
    expect(first.error).toBeNull();
    expect(first.data?.[0]).toMatchObject({ status: "pending" });
    const itemId = first.data?.[0]?.itemId;
    expect((await owner.rpc("workspace_snapshot")).data.forecastInput.availableCents).toBe(before.forecastInput.availableCents);
    const applied = await finance.rpc("apply_intake", { p_item_id: itemId, p_review_version: 1, p_expected_revision: before.revision });
    expect(applied.error).toBeNull();
    const repeated = await finance.rpc("stage_intake_batch", { p_source_id: source.data, p_rows: [row(excelCandidate, "fictional.xlsx")] });
    expect(repeated.error).toBeNull();
    expect(repeated.data?.[0]).toMatchObject({ itemId, status: "applied", replayed: true });
    expect((await owner.from("invoices").select("id").eq("business_id", business.id).eq("number", "SAMPLE-INV-001")).data).toHaveLength(1);
    expect((await owner.rpc("workspace_snapshot")).data.forecastInput.availableCents).toBe(before.forecastInput.availableCents);
  });


  async function bulkProposals(prefix: string): Promise<string[]> {
    const result = await owner.rpc("stage_intake_batch", { p_source_id: sourceId, p_rows: [1, 2, 3].map(index => ({
      externalId: prefix + "-" + index, sourceVersion: "1", evidence: { row: index + 1 },
      candidate: { type: "save_invoice", payload: { ...invoice(business.customerId).payload, number: prefix + "-" + index } },
    })) });
    expect(result.error).toBeNull();
    const ids: string[] = result.data.map((row: { itemId: string; status: string }) => { expect(row.status).toBe("pending"); return row.itemId; });
    expect(ids).toHaveLength(3);
    return ids;
  }

  it("confirms selected items independently and isolates a stale one", async () => {
    const ids = await bulkProposals("BULK-STALE");
    const snapshot = await owner.rpc("workspace_snapshot");
    expect(snapshot.error).toBeNull();
    const revision = snapshot.data.revision;
    const amended = await finance.rpc("amend_intake", {
      p_item_id: ids[1], p_review_version: 1, p_expected_revision: revision,
      p_candidate: { type: "save_invoice", payload: { ...invoice(business.customerId, 25_000).payload, number: "BULK-STALE-2" } },
      p_note: "Checked the isolated fictional invoice.",
    });
    expect(amended.error).toBeNull();
    expect(amended.data).toBe(2);
    const before = await owner.from("cash_movements").select("id", { count: "exact", head: true }).eq("business_id", business.id);
    expect(before.error).toBeNull();
    bulkSession.actor = { userId: business.accounts.finance.id, businessId: business.id, role: "finance" };
    bulkSession.rpc.mockImplementation((name: string, args: object) => finance.rpc(name, args));
    expect(await confirmSelectedIntake({ items: ids.map(id => ({ id, reviewVersion: 1 })), revision })).toEqual({
      confirmed: [ids[0], ids[2]], failed: [{ id: ids[1], code: "STALE_VERSION" }], revision: revision + 2,
    });
    const stored = await owner.from("intake_items").select("id,status").eq("business_id", business.id).in("id", ids);
    expect(stored.error).toBeNull();
    expect(Object.fromEntries(stored.data!.map(row => [row.id, row.status]))).toEqual({ [ids[0]]: "applied", [ids[1]]: "pending", [ids[2]]: "applied" });
    const after = await owner.from("cash_movements").select("id", { count: "exact", head: true }).eq("business_id", business.id);
    expect(after.error).toBeNull();
    expect(after.count).toBe(before.count);
    bulkSession.rpc.mockReset();
  });

  it("stops chaining when another session changes the business mid-batch", async () => {
    const ids = await bulkProposals("BULK-CONCURRENT");
    const snapshot = await owner.rpc("workspace_snapshot");
    expect(snapshot.error).toBeNull();
    const revision = snapshot.data.revision;
    let financeChanged = false;
    bulkSession.actor = { userId: business.accounts.owner.id, businessId: business.id, role: "owner" };
    bulkSession.rpc.mockImplementation(async (name: string, args: { p_item_id?: string }) => {
      const result = await owner.rpc(name, args);
      if (args.p_item_id === ids[0] && !result.error && !financeChanged) {
        const change = await finance.rpc("workspace_command", { p_command: {
          requestId: randomUUID(), expectedRevision: result.data.revision, type: "save_customer",
          payload: { name: "Concurrent fictional customer", contactName: "Test contact" },
        } });
        expect(change.error).toBeNull();
        financeChanged = true;
      }
      return result;
    });
    expect(await confirmSelectedIntake({ items: ids.map(id => ({ id, reviewVersion: 1 })), revision })).toEqual({
      confirmed: [ids[0]], failed: [{ id: ids[1], code: "STALE_VERSION" }, { id: ids[2], code: "STALE_VERSION" }], revision: revision + 1,
    });
    expect(financeChanged).toBe(true);
    expect(bulkSession.rpc).toHaveBeenCalledTimes(3);
    const stored = await owner.from("intake_items").select("id,status").eq("business_id", business.id).in("id", ids);
    expect(stored.error).toBeNull();
    expect(Object.fromEntries(stored.data!.map(row => [row.id, row.status]))).toEqual({ [ids[0]]: "applied", [ids[1]]: "pending", [ids[2]]: "pending" });
    bulkSession.rpc.mockReset();
  });
});
