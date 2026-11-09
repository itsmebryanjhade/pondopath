import { z } from "zod";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { expenseLinks, formatPlanDate } from "@/lib/display";
import { buildNextActions } from "@/lib/ui/next-actions";
import { fullIsoDates, mentionsInvoiceNumber, namesAnotherInvoice, type AssistantChatRequest } from "./ai";
import { assertLocalDate } from "./dates";
import { calculateForecast } from "./forecast";
import { checkedSum, formatPHP } from "./money";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
export const assistantChatOutputSchema = z.strictObject({
  kind: z.enum(["answer", "clarify"]),
  summary: text(3000),
  factIds: z.array(text(80)).max(12),
  recordIds: z.array(z.uuid()).max(12),
  draft: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("reminder"), invoiceId: z.uuid(), text: text(2000) }),
    z.strictObject({ kind: z.literal("followup"), invoiceId: z.uuid(), text: text(4000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  ]).nullable(),
});

type Fact = { id: string; label: string; value: string };
type Source = { id: string; kind: "invoice" | "expense"; label: string; href: string };
type ChatReply = z.infer<typeof assistantChatOutputSchema>;
export type AssistantChatProposal = Pick<ChatReply, "kind" | "summary" | "draft"> & {
  task: "chat";
  sourceRevision: number;
  facts: Fact[];
  sources: Source[];
};

const help = [
  "Expected payments affect the forecast. Only verified receipts count as cash.",
  "Check the payment before recording it. Changes to a payment plan do not record a receipt.",
  "Review draft messages or follow-up tasks in the existing forms. The owner approves reminders.",
];

const actionText = {
  missed_promise: "Check whether the promised payment arrived",
  followup: "Follow up on the invoice",
  missing_expectation: "Ask when the customer expects to pay",
  reminder_review: "Review the reminder for approval",
};

const clarificationText = {
  invoice: {
    english: "Which unpaid invoice should I use? Choose an invoice or type invoice followed by its number.",
    tagalog: "Aling hindi pa bayad na invoice ang gagamitin? Pumili ng invoice o i-type ang salitang invoice at ang numero nito.",
    taglish: "Aling unpaid invoice ang gagamitin? Pumili ng invoice o i-type ang invoice at ang number nito.",
  },
  date: {
    english: "What date should the follow-up be due? Enter one date in YYYY-MM-DD format.",
    tagalog: "Kailan dapat gawin ang follow-up? Ilagay ang isang petsa sa format na YYYY-MM-DD.",
    taglish: "Kailan ang follow-up? Enter one date in YYYY-MM-DD format.",
  },
};

function replyLanguage(request: AssistantChatRequest) {
  if (request.language !== "auto") return request.language;
  if (!/\b(?:po|ba|paki\w*|bukas|kailan|pwede|puwede|gumawa|paalala|petsa|halaga|resibo|bayad|mga)\b/i.test(request.question)) {
    return "english";
  }
  return /\b(?:please|draft|reminder|follow[- ]?up|invoice|date|when)\b/i.test(request.question) ? "taglish" : "tagalog";
}

function clarify(request: AssistantChatRequest, missing: keyof typeof clarificationText): AssistantChatProposal {
  const language = replyLanguage(request);
  return {
    task: "chat", sourceRevision: request.expectedRevision, kind: "clarify", summary: clarificationText[missing][language],
    facts: [], sources: [], draft: null,
  };
}

function followupDate(question: string, referenceDate: string, invoiceNumber: string) {
  const dates = fullIsoDates(question, invoiceNumber);
  if (dates.size !== 1 || /\b(?:or|maybe|baka)\b/i.test(question)) return null;
  try {
    const date = assertLocalDate([...dates][0]);
    return date >= referenceDate ? date : null;
  } catch {
    return null;
  }
}

function forecastFacts(workspace: WorkspaceSnapshot, forecast: ReturnType<typeof calculateForecast>): Fact[] {
  const last = forecast.days.at(-1)!;
  return [
    { id: "cash-now", label: "Cash now", value: formatPHP(workspace.forecastInput.availableCents) },
    { id: "expected-in", label: "Expected in (not yet received)", value: formatPHP(checkedSum(forecast.days.map(day => day.expectedInCents))) },
    { id: "planned-out", label: "Planned out", value: formatPHP(checkedSum(forecast.days.map(day => day.plannedOutCents))) },
    { id: "forecast-close", label: "Projected cash on " + formatPlanDate(last.date), value: formatPHP(last.closingCents) },
    { id: "first-shortfall", label: "First projected shortfall", value: forecast.firstShortage
      ? formatPHP(forecast.firstShortage.shortfallCents) + " on " + formatPlanDate(forecast.firstShortage.date) : "None in this plan" },
    { id: "largest-shortfall", label: "Largest projected shortfall", value: formatPHP(forecast.maxShortfallCents) },
  ];
}

export function buildAssistantChatContext(workspace: WorkspaceSnapshot, request: AssistantChatRequest) {
  if (workspace.revision !== request.expectedRevision) throw new Error("STALE_VERSION");
  const referenceDate = workspace.forecastInput.referenceDate;
  const selected = request.context?.record;
  const invoicesById = new Map(workspace.invoices.map(row => [row.id, row]));
  const explicitInvoice = selected?.kind === "invoice" ? invoicesById.get(selected.id) : undefined;
  const expense = selected?.kind === "expense" ? workspace.expenses.find(row => row.id === selected.id) : undefined;
  if (selected && !explicitInvoice && !expense) throw new Error("NOT_FOUND");

  const mentioned = workspace.invoices.filter(row => mentionsInvoiceNumber(request.question, row.number));
  if (mentioned.length > 1 || (explicitInvoice && mentioned.some(row => row.id !== explicitInvoice.id))) return clarify(request, "invoice");
  const invoice = explicitInvoice ?? (expense ? undefined : mentioned[0]);
  if (invoice && namesAnotherInvoice(request.question, invoice.number)) return clarify(request, "invoice");
  const date = invoice ? followupDate(request.question, referenceDate, invoice.number) : null;
  if (request.intent && (!invoice || invoice.outstanding_cents <= 0)) return clarify(request, "invoice");
  if (request.intent === "draft_followup" && date === null) return clarify(request, "date");

  const forecast = request.intent ? null : calculateForecast(workspace.forecastInput);
  const actions = request.intent ? [] : buildNextActions(workspace).flatMap(action => {
    if (action.kind === "intake_review") return [];
    const invoiceId = action.href.slice("/invoices/".length);
    if (!invoicesById.get(invoiceId)?.outstanding_cents) return [];
    return [{ kind: action.kind, invoiceId, dueDate: action.dueDate }];
  });
  const openInvoices = workspace.invoices.filter(row => row.outstanding_cents > 0);
  const openExpenses = workspace.expenses.filter(row => row.unpaid_cents > 0);
  const invoiceIds = new Set([
    ...actions.map(action => action.invoiceId),
    ...(forecast?.days.flatMap(day => day.invoiceIds) ?? []),
    ...openInvoices.map(row => row.id),
  ]);
  const invoiceRows = invoice ? [invoice] : expense ? [] : [...invoiceIds].flatMap(id => {
    const row = invoicesById.get(id);
    return row && row.outstanding_cents > 0 ? [row] : [];
  }).slice(0, 30);
  const expenseRows = expense ? [expense] : invoice ? [] : openExpenses.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id)).slice(0, 30);
  const customerNames = new Map(workspace.customers.map(row => [row.id, row.name]));
  const expectations = new Map(workspace.forecastInput.invoices.map(row => [row.id, row.expectation]));
  const records = [
    ...invoiceRows.map(row => {
      const expected = expectations.get(row.id);
      return {
        id: row.id, kind: "invoice" as const, label: row.number.slice(0, 120), party: customerNames.get(row.customer_id)?.slice(0, 120),
        dueDate: row.due_date, balanceCents: row.outstanding_cents,
        expected: expected ? { date: expected.date, remainingCents: expected.remainingCents, kind: expected.kind, needsReview: expected.needsReview } : null,
      };
    }),
    ...expenseRows.map(row => ({
      id: row.id, kind: "expense" as const, label: row.label.slice(0, 120), party: row.payee?.slice(0, 120),
      dueDate: row.due_date, balanceCents: row.unpaid_cents, expected: null,
    })),
  ];
  const sentRecords = new Map(records.map(record => [record.id, record]));
  const worklist = actions.filter(action => sentRecords.has(action.invoiceId)).slice(0, 8);
  const facts = forecast ? forecastFacts(workspace, forecast) : [];
  for (const record of records) {
    facts.push(
      { id: "balance:" + record.id, label: "Unpaid amount on " + record.label, value: formatPHP(record.balanceCents) },
      { id: "due:" + record.id, label: "Due date for " + record.label, value: formatPlanDate(record.dueDate) },
    );
    if (record.expected && !record.expected.needsReview && record.expected.date >= referenceDate && record.expected.remainingCents > 0) {
      facts.push({ id: "expected:" + record.id, label: "Expected payment for " + record.label,
        value: formatPHP(record.expected.remainingCents) + " on " + formatPlanDate(record.expected.date) });
    }
  }
  const first = worklist[0];
  if (first) facts.push({ id: "first-invoice-action", label: "First invoice action", value: actionText[first.kind] + " for " + sentRecords.get(first.invoiceId)!.label });
  return {
    data: {
      currency: "PHP", referenceDate, selectedInvoiceId: invoice?.id ?? null, followupDate: date,
      records, facts, worklist, help,
      omittedInvoiceCount: openInvoices.length - invoiceRows.filter(row => row.outstanding_cents > 0).length,
      omittedExpenseCount: openExpenses.length - expenseRows.filter(row => row.unpaid_cents > 0).length,
    },
  };
}

type AssistantChatContext = Extract<ReturnType<typeof buildAssistantChatContext>, { data: unknown }>;

const unsafeText = /[\p{Cf}<>\[\]\u0060]|(?:[a-z][a-z+.-]*:\/\/|(?:mailto|tel|javascript|data):|[\p{L}-]+\.[\p{L}]{2,}|(?:^|\s)\/[a-z])/iu;

function isPlainModelText(value: string) {
  // The app supplies figures and links. Model prose stays plain text.
  const normalized = value.normalize("NFKC");
  return !/[\p{N}\p{Sc}]/u.test(normalized) && !unsafeText.test(normalized);
}

const reminderLabels = {
  english: ["Outstanding amount", "Original due date"],
  tagalog: ["Halagang hindi pa bayad", "Orihinal na takdang petsa"],
  taglish: ["Natitirang balance", "Original due date"],
};

function reminderText(request: AssistantChatRequest, prose: string, invoice: { label: string; balanceCents: number; dueDate: string }) {
  const [amount, due] = reminderLabels[replyLanguage(request)];
  const reference = unsafeText.test(invoice.label.normalize("NFKC")) ? "" : "Invoice " + invoice.label + " · ";
  const body = prose + "\n\n" + reference + amount + " " + formatPHP(invoice.balanceCents) + " · " + due + " " + formatPlanDate(invoice.dueDate);
  if (body.length > 2000) throw new Error("INVALID_AI_OUTPUT");
  return body;
}

export function validateAssistantChatReply(
  request: AssistantChatRequest, context: AssistantChatContext, value: unknown, freshWorkspace: WorkspaceSnapshot,
): AssistantChatProposal {
  if (freshWorkspace.revision !== request.expectedRevision) throw new Error("STALE_VERSION");
  const reply = assistantChatOutputSchema.parse(value);
  if (!isPlainModelText(reply.summary) || (reply.draft && (reply.kind !== "answer" || !isPlainModelText(reply.draft.text)))) {
    throw new Error("INVALID_AI_OUTPUT");
  }
  const current = buildAssistantChatContext(freshWorkspace, request);
  if (!("data" in current) || current.data.referenceDate !== context.data.referenceDate) throw new Error("STALE_VERSION");
  const sentFacts = new Map(context.data.facts.map(fact => [fact.id, fact]));
  const currentFacts = new Map(current.data.facts.map(fact => [fact.id, fact]));
  const sentRecords = new Map(context.data.records.map(record => [record.id, record]));
  const currentRecords = new Map(current.data.records.map(record => [record.id, record]));

  const factIds = new Set(reply.factIds);
  const recordIds = new Set(reply.recordIds);
  if (reply.draft) {
    recordIds.add(reply.draft.invoiceId);
    factIds.add("balance:" + reply.draft.invoiceId);
    factIds.add("due:" + reply.draft.invoiceId);
  }
  const facts = [...factIds].map(id => {
    const sent = sentFacts.get(id);
    if (!sent) throw new Error("INVALID_AI_OUTPUT");
    const fresh = currentFacts.get(id);
    if (fresh?.value !== sent.value || fresh.label !== sent.label) throw new Error("STALE_VERSION");
    return fresh;
  });
  const expenseHrefs = [...recordIds].some(id => sentRecords.get(id)?.kind === "expense") ? expenseLinks(freshWorkspace.expenses) : null;
  const sources = [...recordIds].map(id => {
    const sent = sentRecords.get(id);
    if (!sent) throw new Error("INVALID_AI_OUTPUT");
    const fresh = currentRecords.get(id);
    if (!fresh || fresh.kind !== sent.kind || fresh.label !== sent.label || fresh.dueDate !== sent.dueDate || fresh.balanceCents !== sent.balanceCents) {
      throw new Error("STALE_VERSION");
    }
    const href = fresh.kind === "invoice" ? "/invoices/" + id : expenseHrefs?.get(id);
    if (!href) throw new Error("INVALID_AI_OUTPUT");
    return { id, kind: fresh.kind, label: fresh.label, href };
  });

  let draft = reply.draft;
  if (draft) {
    if (!context.data.selectedInvoiceId) return clarify(request, "invoice");
    const invoice = currentRecords.get(draft.invoiceId);
    if (draft.invoiceId !== context.data.selectedInvoiceId || current.data.selectedInvoiceId !== draft.invoiceId ||
        invoice?.kind !== "invoice" || invoice.balanceCents <= 0 || (request.intent && request.intent !== "draft_" + draft.kind)) {
      throw new Error("INVALID_AI_OUTPUT");
    }
    if (draft.kind === "reminder") {
      draft = { ...draft, text: reminderText(request, draft.text, invoice) };
    } else {
      if (!context.data.followupDate) return clarify(request, "date");
      if (draft.date !== context.data.followupDate || draft.date !== current.data.followupDate) throw new Error("INVALID_AI_OUTPUT");
    }
  }
  return { task: "chat", sourceRevision: freshWorkspace.revision, kind: reply.kind, summary: reply.summary, facts, sources, draft };
}
