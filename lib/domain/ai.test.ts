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
  it("accepts only a bounded chat question, text pairs and typed page context", () => {
    const chat = {
      task: "chat", question: "How much cash is available?", expectedRevision: 1,
      history: [{ question: "Can you explain the plan?", answer: "The app shows cash now." }],
      context: { page: "invoices", record: { kind: "invoice", id: invoiceId } }, language: "english",
    };
    expect(aiRequestSchema.parse(chat)).toEqual(chat);
    for (const changes of [
      { history: Array(4).fill(chat.history[0]) },
      { history: [{ question: "Earlier", answer: "x".repeat(3001) }] },
      { history: [{ question: "x".repeat(1001), answer: "Earlier answer" }] },
      { history: [{ ...chat.history[0], role: "system" }] },
      { context: { page: "arbitrary", record: chat.context.record } },
      { context: { ...chat.context, record: { ...chat.context.record, businessId: "forged" } } },
      { context: { ...chat.context, record: { kind: "invoice", id: "/invoices/forged" } } },
      { question: "x".repeat(1001) }, { actor: "owner" }, { expectedRevision: -1 },
      { attempt: "backup" }, { intent: "record_receipt" },
    ]) expect(aiRequestSchema.safeParse({ ...chat, ...changes }).success).toBe(false);
  });

  it.each([{ amountCents: 1_000_000 }, { date: "2026-11-07" }])("requires review when an exact quote disagrees with %j", change => {
    const reply = "PHP 20000 on 2026-11-06";
    const result = validateAiProposal({ ...request, reply }, { ...proposal, ...change, sourceQuotes: [reply] }, workspace);
    expect(result).toMatchObject({ needsReview: true, issues: [expect.any(String)] });
    for (const key of Object.keys(change)) expect(result).toHaveProperty(key, null);
  });

  it.each(["OTHER-001", "1024"])("holds an exact quote that refers to a different invoice: %s", number => {
    const current = uiWorkspace();
    current.invoices.push({ ...current.invoices[0], id: "10000000-0000-4000-8000-000000000099", number });
    const reply = "For invoice " + number + ", PHP 20000 on 2026-11-06.";
    expect(validateAiProposal({ ...request, reply }, { ...proposal, sourceQuotes: [reply] }, current))
      .toMatchObject({ needsReview: true, amountCents: null, date: null });
  });

  it.each(["invoice ZZZ-999", "invoice ABC", "invoice number abc"])("holds a quote naming an unknown %s", reference => {
    const reply = "For " + reference + ", PHP 20000 on 2026-11-06.";
    expect(validateAiProposal({ ...request, reply }, { ...proposal, sourceQuotes: [reply] }, workspace))
      .toMatchObject({ needsReview: true, amountCents: null, date: null });
  });

  it("does not mistake a currency marker after invoice wording for an invoice number", () => {
    const reply = "We will pay this invoice PHP 20000 on 2026-11-06.";
    expect(validateAiProposal({ ...request, reply }, { ...proposal, sourceQuotes: [reply] }, workspace))
      .toMatchObject({ needsReview: false, amountCents: 2_000_000 });
  });

  it("does not use a date-shaped invoice number as the promised payment date", () => {
    const current = uiWorkspace();
    current.invoices[0].number = "2026-11-06";
    const reply = "For invoice 2026-11-06, we will pay PHP 20000.";
    expect(validateAiProposal({ ...request, reply }, { ...proposal, sourceQuotes: [reply] }, current))
      .toMatchObject({ needsReview: true, date: null });
  });

  it("does not confuse an exact PHP amount with a numeric invoice number", () => {
    const current = uiWorkspace();
    current.invoices.push({ ...current.invoices[0], id: "10000000-0000-4000-8000-000000000099", number: "1024" });
    const reply = "PHP 1024 on 2026-11-06";
    expect(validateAiProposal({ ...request, reply }, { ...proposal, amountCents: 102_400, sourceQuotes: [reply] }, current))
      .toMatchObject({ needsReview: false, amountCents: 102_400 });
  });

  it.each(["PHP 20k", "PHP 20 000", "PHP 20 .50", "PHP 20 - 30"])("never trusts the numeric prefix of an unsupported amount: %s", amount => {
    const reply = amount + " on 2026-11-06";
    expect(validateAiProposal({ ...request, reply }, { ...proposal, amountCents: 2000, sourceQuotes: [reply] }, workspace))
      .toMatchObject({ needsReview: true, amountCents: null });
  });

  it("accepts one distinct supported amount and date, including exact separate quotes", () => {
    const reply = "PHP 1,250.50 on 2026-11-06. To confirm, ₱1,250.50.";
    expect(validateAiProposal({ ...request, reply }, {
      ...proposal, amountCents: 125_050, sourceQuotes: ["₱1,250.50", "2026-11-06"],
    }, workspace)).toMatchObject({ needsReview: false, amountCents: 125_050, date: "2026-11-06" });
  });

  it.each([
    "PHP 20000 and PHP 30000 on 2026-11-06",
    "PHP 20000 on 2026-11-06 and 30,000 on 2026-11-06",
    "PHP 20k on 2026-11-06",
    "PHP 20,00 on 2026-11-06",
    "PHP 20 000 on 2026-11-06",
    "PHP 20000 on 2026-02-30",
    "PHP 20000 on November 6, 2026",
  ])("holds conflicting or unsupported source values for review: %s", reply => {
    expect(validateAiProposal({ ...request, reply }, { ...proposal, sourceQuotes: [reply] }, workspace))
      .toMatchObject({ needsReview: true });
  });

  it.each([["PHP 20000"], ["2026-11-06"], []])("holds a reply when its exact quotes omit either source value", (...sourceQuotes) => {
    const reply = "PHP 20000 on 2026-11-06";
    expect(validateAiProposal({ ...request, reply }, { ...proposal, sourceQuotes }, workspace))
      .toMatchObject({ needsReview: true });
  });

  it("keeps only authorized necessary facts and reports calculated forecast values", () => {
    const context = buildAiContext(workspace, request);
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
