import { describe, expect, it } from "vitest";
import { aiRequestSchema, buildAiContext, validateAiProposal } from "./ai";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const workspace = uiWorkspace();
const invoiceId = workspace.invoices[0].id;
const request = { task: "extract_reply" as const, invoiceId, reply: "Sa 2026-11-06 po, PHP 20000 muna.", language: "taglish" as const, expectedRevision: 1 };
const proposal = { invoiceId, amountCents: 2_000_000, date: "2026-11-06", reason: null, sourceQuotes: [request.reply], needsReview: false, issues: [] };

describe("bounded multilingual AI proposals", () => {
  it("rejects authority overrides, oversized replies and missing selected invoices", () => {
    expect(aiRequestSchema.safeParse({ ...request, businessId: "other" }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, reply: "x".repeat(4001) }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ task: "extract_reply", reply: "hello", expectedRevision: 1 }).success).toBe(false);
    expect(aiRequestSchema.parse(request).language).toBe("taglish");
  });
  it("keeps only authorized necessary facts and reports calculated forecast values", () => {
    const context = buildAiContext(workspace, aiRequestSchema.parse(request));
    expect(context.allowedRecordIds).toContain(invoiceId);
    expect(JSON.stringify(context.data)).not.toContain(workspace.actor.userId);
    expect(JSON.stringify(context.data)).not.toContain("email");
    expect(context.data.referenceDate).toBe("2026-10-29");
    expect(context.data.forecast).toBeUndefined();
    expect(context.data.expenses).toBeUndefined();
    expect(context.data.availableCents).toBeUndefined();
    const explanation = buildAiContext(workspace, { task: "explain", question: "Cash plan?", language: "english", expectedRevision: 1 });
    expect(explanation.data.forecast?.days).toHaveLength(30);
    expect(() => buildAiContext(workspace, { ...request, invoiceId: "10000000-0000-4000-8000-000000000099" })).toThrow();
  });
  it("accepts reviewed Taglish details while rejecting foreign invoices, excess amounts and invented quotes", () => {
    expect(validateAiProposal(request, proposal, workspace)).toMatchObject({ task: "extract_reply", sourceRevision: 1, amountCents: 2_000_000 });
    for (const changed of [{ invoiceId: "other" }, { amountCents: 9_000_000 }, { sourceQuotes: ["invented"] }, { date: "2026-02-30" }]) {
      expect(() => validateAiProposal(request, { ...proposal, ...changed }, workspace)).toThrow();
    }
    expect(() => validateAiProposal({ ...request, expectedRevision: 0 }, proposal, workspace)).toThrow();
  });
  it("retains missing values and forces verification of claimed payments", () => {
    const claimed = { ...request, reply: "Bayad na po kami kahapon." };
    expect(validateAiProposal(claimed, { ...proposal, amountCents: null, date: null, sourceQuotes: [claimed.reply] }, workspace)).toMatchObject({ needsReview: true, amountCents: null, date: null });
    expect(workspace.invoices[0].outstanding_cents).toBe(5_000_000);
  });
  it("holds multiple dates/installments even if the model selects only the first", () => {
    const installments = { ...request, reply: "PHP 10000 sa 2026-11-02 then PHP 20000 sa 2026-11-09, dalawang installment po." };
    expect(validateAiProposal(installments, { ...proposal, amountCents: 1_000_000, date: "2026-11-02", sourceQuotes: [installments.reply] }, workspace)).toMatchObject({ needsReview: true });
  });
  it("does not accept an invented exact date from a weekday-only reply or uncertain amounts", () => {
    for (const reply of ["Sa Biyernes na lang po namin babayaran ang invoice.", "We may pay PHP 20000 or PHP 30000 on 2026-11-06. We have not decided."]) {
      expect(validateAiProposal({ ...request, reply }, { ...proposal, sourceQuotes: [reply] }, workspace)).toMatchObject({ needsReview: true });
    }
  });
  it("rejects unsupported source IDs and never accepts executable fields", () => {
    const explain = { task: "explain" as const, question: "Bakit kulang ang cash?", language: "tagalog" as const, expectedRevision: 1 };
    expect(validateAiProposal(explain, { summary: "Expected payment pa lang ito.", recordIds: [invoiceId] }, workspace)).toMatchObject({ task: "explain" });
    expect(() => validateAiProposal(explain, { summary: "Wrong source", recordIds: ["other"] }, workspace)).toThrow();
    expect(() => validateAiProposal(request, { ...proposal, execute: "record_receipt" }, workspace)).toThrow();
  });
});
