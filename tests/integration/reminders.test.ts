import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reminderBasis } from "../../lib/domain/reminders";
import { admin, callCommand, createTestBusiness, disposeTestBusiness, signInAs, type TestBusiness } from "./helpers";

describe("versioned reminder approval and manual reporting", () => {
  let fixture: TestBusiness;
  let owner: SupabaseClient;
  let finance: SupabaseClient;
  const expectationId = randomUUID();
  function checked<T extends { error: unknown }>(result: T): Extract<T, { error: null }> {
    expect(result.error).toBeNull();
    return result as Extract<T, { error: null }>;
  }
  beforeAll(async () => {
    fixture = await createTestBusiness();
    owner = await signInAs(fixture.accounts.owner);
    finance = await signInAs(fixture.accounts.finance);
  });
  beforeEach(async () => {
    if (fixture.name !== "test-" + fixture.id) throw new Error("Refusing a non-fixture reset.");
    for (const table of ["reminders", "expectations", "audit_events", "command_receipts", "cash_movements"]) {
      checked(await admin.from(table).delete().eq("business_id", fixture.id));
    }
    checked(await admin.from("invoices").update({ amount_cents: 5_000_000, due_date: "2026-10-29", version: 1 }).eq("id", fixture.invoiceId));
    checked(await admin.from("customers").update({ contact_name: "Test contact", email: "accounts@example.com", phone: null, version: 1 }).eq("id", fixture.customerId));
    checked(await admin.from("businesses").update({ revision: 0, demo_reference_date: "2026-10-29" }).eq("id", fixture.id).eq("name", fixture.name));
    checked(await admin.from("expectations").insert({ id: expectationId, business_id: fixture.id, invoice_id: fixture.invoiceId, amount_cents: 5_000_000, remaining_cents: 5_000_000, expected_date: "2026-10-29", kind: "assumption", source_note: "Fixture expectation", confirmed_by: fixture.accounts.owner.id }));
  });
  afterAll(async () => {
    await owner?.auth.signOut({ scope: "local" });
    await finance?.auth.signOut({ scope: "local" });
    if (fixture) await disposeTestBusiness(fixture);
  });

  async function snapshot(client = finance) {
    return checked(await client.rpc("workspace_snapshot")).data as { revision: number };
  }
  async function command(client: SupabaseClient, type: string, payload: object, revision?: number) {
    return callCommand(client, {
      requestId: randomUUID(),
      expectedRevision: revision ?? (await snapshot(client)).revision,
      type,
      payload,
    });
  }
  async function prepareReminder() {
    const saved = checked(await command(finance, "save_reminder", {
      invoiceId: fixture.invoiceId,
      recipient: "accounts@example.com",
      body: "Please confirm payment of PHP 30,000 for INV-001.",
    })).data as { recordId: string };
    checked(await command(finance, "submit_reminder", { id: saved.recordId, reminderVersion: 1 }));
    const row = checked(await admin.from("reminders").select("*").eq("id", saved.recordId).single()).data;
    const basis = (row.approval_basis as { digest: string }).digest;
    expect(basis).toBe(reminderBasis({
      invoiceId: fixture.invoiceId,
      invoiceVersion: 1,
      outstandingCents: 5_000_000,
      contactVersion: 1,
      expectationId,
      expectationVersion: 1,
      referenceDate: "2026-10-29",
    }));
    return { id: saved.recordId, version: row.version as number, basis };
  }
  async function approve() {
    const pending = await prepareReminder();
    checked(await command(owner, "approve_reminder", { id: pending.id, reminderVersion: pending.version, approvalBasis: pending.basis }));
    return pending.id;
  }

  it("requires owner review of the submitted version, then records an unverified manual send", async () => {
    const pending = await prepareReminder();
    expect((await command(finance, "approve_reminder", { id: pending.id, reminderVersion: pending.version, approvalBasis: pending.basis })).error?.message).toBe("FORBIDDEN");
    checked(await command(owner, "approve_reminder", { id: pending.id, reminderVersion: pending.version, approvalBasis: pending.basis }));
    const snapshot = checked(await admin.from("reminders").select("state,approved_version,approved_body,approved_recipient,version").eq("id", pending.id).single()).data;
    expect(snapshot).toMatchObject({ state: "approved", approved_version: pending.version, approved_body: "Please confirm payment of PHP 30,000 for INV-001.", approved_recipient: "accounts@example.com", version: pending.version + 1 });
    const copied = checked(await owner.rpc("get_approved_reminder_text", { p_id: pending.id })).data as { text: string; stale: boolean };
    expect(copied).toEqual({ text: snapshot.approved_body, stale: false });
    checked(await command(finance, "report_manual_send", { id: pending.id, reminderVersion: snapshot.version, channel: "Email", sentAt: "2026-10-29T09:30:00+08:00" }));
    const reported = checked(await admin.from("reminders").select("state,reported_by,reported_channel,reported_sent_at").eq("id", pending.id).single()).data;
    expect(reported).toMatchObject({ state: "reported_sent", reported_by: fixture.accounts.finance.id, reported_channel: "Email" });
    expect(new Date(reported.reported_sent_at ?? "").toISOString()).toBe("2026-10-29T01:30:00.000Z");
  });

  it("rejects stale review submissions without erasing them after unrelated business changes", async () => {
    const pending = await prepareReminder();
    const staleRevision = (await snapshot(owner)).revision;
    checked(await command(finance, "save_expense", { label: "Payroll", payee: "Employees", amountCents: 1_000_000, dueDate: "2026-10-30" }));
    expect((await command(owner, "approve_reminder", { id: pending.id, reminderVersion: pending.version, approvalBasis: pending.basis }, staleRevision)).error?.message).toBe("STALE_VERSION");
    expect(checked(await admin.from("reminders").select("state,version").eq("id", pending.id).single()).data).toEqual({ state: "awaiting_review", version: pending.version });
    checked(await command(owner, "approve_reminder", { id: pending.id, reminderVersion: pending.version, approvalBasis: pending.basis }));
    expect(checked(await owner.rpc("get_approved_reminder_text", { p_id: pending.id })).data).toMatchObject({ text: "Please confirm payment of PHP 30,000 for INV-001.", stale: false });
  });

  it("clears approval when the current reference date changes before copy", async () => {
    const id = await approve();
    checked(await admin.from("businesses").update({ demo_reference_date: "2026-10-30" }).eq("id", fixture.id).eq("name", fixture.name));
    const response = checked(await owner.rpc("get_approved_reminder_text", { p_id: id })).data as { text: string | null; stale: boolean };
    expect(response).toMatchObject({ text: null, stale: true });
    expect(checked(await admin.from("reminders").select("state,approval_basis,approved_version,approved_body,approved_recipient").eq("id", id).single()).data).toEqual({ state: "draft", approval_basis: null, approved_version: null, approved_body: null, approved_recipient: null });
    expect(checked(await admin.from("audit_events").select("id").eq("entity_kind", "reminder").eq("entity_id", id)).data).toHaveLength(4);
  });

  it("uses the new balance after a partial receipt and retains rejection feedback until the draft is edited", async () => {
    const pending = await prepareReminder();
    checked(await command(owner, "reject_reminder", { id: pending.id, reminderVersion: pending.version, approvalBasis: pending.basis, reason: "Please confirm the recipient first." }));
    expect(checked(await admin.from("reminders").select("state,rejection_reason").eq("id", pending.id).single()).data).toEqual({ state: "rejected", rejection_reason: "Please confirm the recipient first." });
    checked(await command(finance, "save_reminder", { id: pending.id, invoiceId: fixture.invoiceId, recipient: "accounts@example.com", body: "Please confirm payment of PHP 30,000 for INV-001." }));
    const edited = checked(await admin.from("reminders").select("state,rejection_reason,version").eq("id", pending.id).single()).data;
    expect(edited).toMatchObject({ state: "draft", rejection_reason: null, version: pending.version + 2 });
    checked(await command(finance, "submit_reminder", { id: pending.id, reminderVersion: edited.version }));
    const submitted = checked(await admin.from("reminders").select("version,approval_basis").eq("id", pending.id).single()).data;
    checked(await command(owner, "approve_reminder", { id: pending.id, reminderVersion: submitted.version, approvalBasis: (submitted.approval_basis as { digest: string }).digest }));
    checked(await command(finance, "post_cash_movement", { kind: "receipt", parentId: fixture.invoiceId, amountCents: 2_000_000, date: "2026-10-29", reference: "REMINDER-PARTIAL" }));
    expect(checked(await admin.from("reminders").select("state,approved_body,approved_recipient,approved_version").eq("id", pending.id).single()).data).toEqual({ state: "draft", approved_body: null, approved_recipient: null, approved_version: null });
    expect((checked(await owner.rpc("workspace_snapshot")).data as { invoices: { outstanding_cents: number }[] }).invoices[0].outstanding_cents).toBe(3_000_000);
  });
});
