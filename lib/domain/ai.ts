import { z } from "zod";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { calculateForecast } from "./forecast";
import { assertLocalDate } from "./dates";
import { MAX_RECORD_CENTS } from "./money";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const common = { expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), language: z.enum(["auto", "english", "tagalog", "taglish"]).default("auto") };
export const aiRequestSchema = z.discriminatedUnion("task", [
  z.strictObject({ ...common, task: z.literal("explain"), invoiceId: z.uuid().optional(), question: text(1000) }),
  z.strictObject({ ...common, task: z.literal("extract_reply"), invoiceId: z.uuid(), reply: text(4000) }),
  z.strictObject({ ...common, task: z.literal("draft_reminder"), invoiceId: z.uuid(), tone: z.enum(["polite", "firm"]).default("polite") }),
]);
export type AiRequest = z.infer<typeof aiRequestSchema>;

export const aiOutputSchemas = {
  explain: z.strictObject({ summary: text(3000), recordIds: z.array(z.uuid()).max(60) }),
  extract_reply: z.strictObject({ invoiceId: z.uuid().nullable(), amountCents: z.number().int().min(1).max(MAX_RECORD_CENTS).nullable(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), reason: text(1000).nullable(), sourceQuotes: z.array(text(1000)).max(8), needsReview: z.boolean(), issues: z.array(text(300)).max(8) }),
  draft_reminder: z.strictObject({ body: text(2000) }),
};
type Version = { sourceRevision: number };
export type AiProposal =
  | (z.infer<typeof aiOutputSchemas.explain> & Version & { task: "explain" })
  | (z.infer<typeof aiOutputSchemas.extract_reply> & Version & { task: "extract_reply" })
  | (z.infer<typeof aiOutputSchemas.draft_reminder> & Version & { task: "draft_reminder"; invoiceId: string; recipient: string });

export function buildAiContext(workspace: WorkspaceSnapshot, request: AiRequest) {
  if (workspace.revision !== request.expectedRevision) throw new Error("STALE_VERSION");
  const selected = request.invoiceId ? workspace.invoices.find(row => row.id === request.invoiceId) : undefined;
  if (request.invoiceId && !selected) throw new Error("NOT_FOUND");
  const forecast = request.task === "explain" ? calculateForecast(workspace.forecastInput) : undefined;
  const relevant = new Set(forecast?.days.flatMap(day => day.invoiceIds) ?? []);
  const invoices = selected ? [selected] : [...workspace.invoices].sort((a, b) => Number(relevant.has(b.id)) - Number(relevant.has(a.id))).slice(0, 30);
  const expenses = request.task === "explain" ? workspace.expenses.filter(row => row.unpaid_cents > 0).slice(0, 30) : [];
  const customer = selected ? workspace.customers.find(row => row.id === selected.customer_id) : undefined;
  return {
    allowedRecordIds: [...invoices.map(row => row.id), ...expenses.map(row => row.id)],
    data: {
      currency: "PHP", referenceDate: workspace.forecastInput.referenceDate,
      availableCents: request.task === "explain" ? workspace.forecastInput.availableCents : undefined, forecast,
      invoices: invoices.map(row => ({ id: row.id, number: row.number, originalDueDate: row.due_date, outstandingCents: row.outstanding_cents, paidCents: row.paid_cents, expectation: workspace.forecastInput.invoices.find(item => item.id === row.id)?.expectation ?? null })),
      expenses: request.task === "explain" ? expenses.map(row => ({ id: row.id, label: row.label, dueDate: row.due_date, unpaidCents: row.unpaid_cents })) : undefined,
      contactName: request.task === "draft_reminder" ? customer?.contact_name : undefined,
      omittedInvoiceCount: Math.max(0, workspace.invoices.length - invoices.length),
      omittedExpenseCount: Math.max(0, workspace.expenses.filter(row => row.unpaid_cents > 0).length - expenses.length),
    },
  };
}

export function validateAiProposal(request: AiRequest, value: unknown, workspace: WorkspaceSnapshot): AiProposal {
  const context = buildAiContext(workspace, request);
  const sourceRevision = workspace.revision;
  if (request.task === "explain") {
    const result = aiOutputSchemas.explain.parse(value);
    if (result.recordIds.some(id => !context.allowedRecordIds.includes(id))) throw new Error("INVALID_AI_OUTPUT");
    return { ...result, task: request.task, sourceRevision };
  }
  const invoice = workspace.invoices.find(row => row.id === request.invoiceId)!;
  if (request.task === "draft_reminder") {
    const customer = workspace.customers.find(row => row.id === invoice.customer_id)!;
    if (invoice.outstanding_cents <= 0) throw new Error("INVALID_AI_OUTPUT");
    return { ...aiOutputSchemas.draft_reminder.parse(value), task: request.task, sourceRevision, invoiceId: invoice.id, recipient: customer.email || customer.phone || customer.contact_name };
  }
  const result = aiOutputSchemas.extract_reply.parse(value);
  if ((result.invoiceId !== null && result.invoiceId !== invoice.id) || (result.amountCents !== null && result.amountCents > invoice.outstanding_cents) || result.sourceQuotes.some(quote => !request.reply.includes(quote))) throw new Error("INVALID_AI_OUTPUT");
  if (result.date !== null) assertLocalDate(result.date);
  if ((result.date !== null || result.amountCents !== null) && !result.sourceQuotes.length) throw new Error("INVALID_AI_OUTPUT");
  const issues = [...result.issues];
  const explicitDates = new Set(request.reply.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []);
  if (explicitDates.size > 1 || /\b(?:installments?|hulugan|dalawang hulog)\b/i.test(request.reply)) issues.push("Multiple installments or dates need clarification. Choose one active receipt plan manually; do not merge the schedule.");
  if (result.date && !explicitDates.has(result.date) && (!/\b\d{4}\b/.test(request.reply) || /\b(?:tomorrow|bukas|next|susunod|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miyerkules|huwebes|biyernes|sabado|linggo)\b/i.test(request.reply))) issues.push("Confirm the exact date and year; relative dates must not become an invented commitment.");
  if (/\b(?:or|maybe|not sure|not decided|baka|hindi pa sigurado)\b/i.test(request.reply)) issues.push("The customer's wording is uncertain. Clarify the amount and date before confirming.");
  if (/\b(?:paid|bayad na|nagbayad|nabayaran|naipadala|sent (?:the )?(?:payment|money))\b/i.test(request.reply)) issues.push("Verify the claimed payment separately; this is not proof of receipt.");
  if (result.invoiceId === null || result.amountCents === null || result.date === null) issues.push("Clarify the invoice, amount and exact date before confirming a receipt plan.");
  return { ...result, task: request.task, sourceRevision, needsReview: result.needsReview || issues.length > 0, issues };
}
