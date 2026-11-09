import { z } from "zod";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { calculateForecast } from "./forecast";
import { assertLocalDate } from "./dates";
import { MAX_RECORD_CENTS, parseMoney } from "./money";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const common = {
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  language: z.enum(["auto", "english", "tagalog", "taglish"]).default("auto"),
};
export const aiRequestSchema = z.discriminatedUnion("task", [
  z.strictObject({ ...common, task: z.literal("explain"), invoiceId: z.uuid().optional(), question: text(1000) }),
  z.strictObject({ ...common, task: z.literal("extract_reply"), invoiceId: z.uuid(), reply: text(4000) }),
  z.strictObject({ ...common, task: z.literal("draft_reminder"), invoiceId: z.uuid(), tone: z.enum(["polite", "firm"]).default("polite") }),
  z.strictObject({
    ...common, task: z.literal("chat"), question: text(1000),
    history: z.array(z.strictObject({ question: text(1000), answer: text(3000) })).max(3),
    context: z.strictObject({
      page: z.enum(["overview", "forecast", "cash", "invoices", "expenses", "followups"]),
      record: z.strictObject({ kind: z.enum(["invoice", "expense"]), id: z.uuid() }).optional(),
    }).optional(),
    intent: z.enum(["draft_reminder", "draft_followup"]).optional(),
  }),
]);
type AssistantRequest = z.infer<typeof aiRequestSchema>;
export type AiRequest = Exclude<AssistantRequest, { task: "chat" }>;
export type AssistantChatRequest = Extract<AssistantRequest, { task: "chat" }>;

export const aiOutputSchemas = {
  explain: z.strictObject({ summary: text(3000), recordIds: z.array(z.uuid()).max(60) }),
  extract_reply: z.strictObject({ invoiceId: z.uuid().nullable(), amountCents: z.number().int().min(1).max(MAX_RECORD_CENTS).nullable(), date: z.string().regex(isoDatePattern).nullable(), reason: text(1000).nullable(), sourceQuotes: z.array(text(1000)).max(8), needsReview: z.boolean(), issues: z.array(text(300)).max(8) }),
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

const invoiceCue = "(?:\\binvoice\\s+(?:(?:no\\.?|number)\\s+)?#?\\s*|#\\s*)";

function invoiceNumberPattern(number: string, prefix: string) {
  const escaped = number.replace(/[.*+?$^{}()|[\]\\]/g, "\\$&");
  return new RegExp(prefix + escaped + "(?![\\p{L}\\p{N}_/-]|\\.[\\p{L}\\p{N}])", "giu");
}

export function mentionsInvoiceNumber(text: string, number: string) {
  if (!number) return false;
  // Short, numeric and date-shaped references can also be ordinary words or values.
  const needsCue = number.length < 3 || /^\d+$/.test(number) || isoDatePattern.test(number);
  return invoiceNumberPattern(number, needsCue ? invoiceCue : "(?<![\\p{L}\\p{N}_./-])").test(text);
}

export function namesAnotherInvoice(text: string, number: string) {
  const wording = text.replace(invoiceNumberPattern(number, invoiceCue), " ");
  const references = new RegExp("(" + invoiceCue + ")([\\p{L}\\p{N}][\\p{L}\\p{N}._/-]*)", "giu");
  for (const [, cue, reference] of wording.matchAll(references)) {
    const labeled = cue.trim().toLowerCase() !== "invoice";
    const looksLikeCode = /\p{N}/u.test(reference) ||
      (/^\p{Lu}/u.test(reference) && !/^PHP\.?$/iu.test(reference));
    if (labeled || looksLikeCode) return true;
  }
  return false;
}

export function fullIsoDates(text: string, invoiceNumber?: string) {
  const wording = invoiceNumber && isoDatePattern.test(invoiceNumber)
    ? text.replace(invoiceNumberPattern(invoiceNumber, invoiceCue), " ")
    : text;
  return new Set(wording.match(/(?<![\p{L}\p{N}_/-])\d{4}-\d{2}-\d{2}(?![\p{L}\p{N}_/-])/gu) ?? []);
}

function phpAmounts(reply: string) {
  const amounts = new Set<number | null>();
  const markedAmount = /([+\u2212-])?[ \t]*(?:\bPHP(?![\p{L}_])|₱)\s*([^\s()[\]{}<>"';!?]*)/giu;
  for (const match of reply.matchAll(markedAmount)) {
    const amount = match[2].replace(/[.,]$/, "");
    const rest = reply.slice(match.index + match[0].length);
    if (match[1] || !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount) ||
        /^\s+(?:(?:[.,+\/\u2013\u2014\u2212-]\s*)?\d+(?![\d-])|(?:k|m|thousand|million|libo|milyon)\b)/iu.test(rest)) {
      amounts.add(null);
      continue;
    }
    try {
      amounts.add(parseMoney(amount.replaceAll(",", "")));
    } catch {
      amounts.add(null);
    }
  }
  const unmarked = reply.replace(markedAmount, " ");
  if (/\b(?:and|or|then|plus|o)\s+\d+(?![\d/-])/iu.test(unmarked) ||
      /(?<![\p{L}\p{N}_./-])(?:\d{1,3}(?:,\d{3})+|\d+\.\d{1,2})(?![\p{L}\p{N}_/-])/u.test(unmarked)) {
    amounts.add(null);
  }
  return amounts;
}

function matchesReplyValue<T>(value: T, replyValues: Set<T>, quoteValues: Set<T>) {
  return replyValues.size === 1 && replyValues.has(value) && quoteValues.size === 1 && quoteValues.has(value);
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
  const issues = [...result.issues];
  const explicitDates = fullIsoDates(request.reply, invoice.number);
  const quotedDates = new Set(result.sourceQuotes.flatMap(quote => [...fullIsoDates(quote, invoice.number)]));
  const quotedAmounts = new Set(result.sourceQuotes.flatMap(quote => [...phpAmounts(quote)]));
  const differentInvoice = namesAnotherInvoice(request.reply, invoice.number) ||
    workspace.invoices.some(row => row.id !== invoice.id && mentionsInvoiceNumber(request.reply, row.number));
  if (differentInvoice) issues.push("The reply names a different invoice. Verify which invoice the customer means.");
  const amountMatches = result.amountCents !== null && matchesReplyValue(result.amountCents, phpAmounts(request.reply), quotedAmounts);
  const dateMatches = result.date !== null && matchesReplyValue(result.date, explicitDates, quotedDates);
  if (result.amountCents !== null && !amountMatches) {
    issues.push("Confirm one exact PHP amount. The amount must match the original reply and its quoted wording.");
  }
  if (result.date !== null && !dateMatches) {
    issues.push("Confirm one exact date in YYYY-MM-DD format. The date must match the original reply and its quoted wording.");
  }
  if (explicitDates.size > 1 || /\b(?:installments?|hulugan|dalawang hulog)\b/i.test(request.reply)) issues.push("Multiple installments or dates need clarification. Choose one active receipt plan manually. Keep installment dates separate.");
  if (/\b(?:or|maybe|not sure|not decided|baka|hindi pa sigurado)\b/i.test(request.reply)) issues.push("The customer's wording is uncertain. Clarify the amount and date before confirming.");
  if (/\b(?:paid|bayad na|nagbayad|nabayaran|naipadala|sent (?:the )?(?:payment|money))\b/i.test(request.reply)) issues.push("Verify the claimed payment separately; this is not proof of receipt.");
  if (result.invoiceId === null || result.amountCents === null || result.date === null) issues.push("Clarify the invoice, amount and exact date before confirming a receipt plan.");
  return {
    ...result, task: request.task, sourceRevision,
    amountCents: amountMatches && !differentInvoice ? result.amountCents : null,
    date: dateMatches && !differentInvoice ? result.date : null,
    needsReview: result.needsReview || issues.length > 0, issues,
  };
}
