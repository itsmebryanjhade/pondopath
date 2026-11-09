import { z } from "zod";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { calculateForecast } from "./forecast";
import { assertLocalDate } from "./dates";
import { MAX_RECORD_CENTS, parseMoney } from "./money";
import { expandAmountShorthand } from "./manual-entry";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const common = {
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  language: z.enum(["auto", "english", "tagalog", "taglish"]).default("auto"),
};
const requiredMappingRoles = ["externalId", "number", "amount", "dueDate", "label", "payee"] as const;
const tempColumnId = z.string().regex(/^c(?:[0-9]|1[0-9]|2[0-3])$/);
const maskedCell = z.enum(["", "<text>", "<amount>", "<date>", "<id>", "<choice>"]);
const mappingRequest = z.strictObject({
  ...common,
  task: z.literal("suggest_import_mapping"),
  attempt: z.enum(["primary", "backup"]).optional(),
  headers: z.array(z.strictObject({ id: tempColumnId, name: text(80) })).min(1).max(24),
  samples: z.array(z.array(maskedCell).max(24)).max(3),
}).superRefine((request, context) => {
  if (new Set(request.headers.map(header => header.id)).size !== request.headers.length || request.headers.some((header, index) => header.id !== `c${index}`)) {
    context.addIssue({ code: "custom", path: ["headers"], message: "Use unique temporary column IDs in order." });
  }
  if (request.samples.some(row => row.length !== request.headers.length)) {
    context.addIssue({ code: "custom", path: ["samples"], message: "Each masked sample must match the selected headers." });
  }
});

export const aiRequestSchema = z.discriminatedUnion("task", [
  z.strictObject({ ...common, task: z.literal("explain"), invoiceId: z.uuid().optional(), question: text(1000) }),
  z.strictObject({ ...common, task: z.literal("extract_reply"), invoiceId: z.uuid(), reply: text(4000) }),
  z.strictObject({ ...common, task: z.literal("draft_reminder"), invoiceId: z.uuid(), tone: z.enum(["polite", "firm"]).default("polite") }),
  z.strictObject({
    ...common,
    task: z.literal("chat"),
    question: text(1000),
    history: z.array(z.strictObject({ question: text(1000), answer: text(3000) })).max(3),
    context: z.strictObject({
      page: z.enum(["overview", "forecast", "cash", "invoices", "expenses", "followups"]),
      record: z.strictObject({ kind: z.enum(["invoice", "expense"]), id: z.uuid() }).optional(),
    }).optional(),
    intent: z.enum(["draft_reminder", "draft_followup"]).optional(),
  }),
  z.strictObject({
    ...common,
    task: z.literal("extract_record"),
    text: text(1000),
  }),
  mappingRequest,
]);
type AssistantRequest = z.infer<typeof aiRequestSchema>;
export type AiRequest = Exclude<AssistantRequest, { task: "chat" }>;
export type AssistantChatRequest = Extract<AssistantRequest, { task: "chat" }>;

export const aiOutputSchemas = {
  explain: z.strictObject({ summary: text(3000), recordIds: z.array(z.uuid()).max(60) }),
  extract_reply: z.strictObject({
    invoiceId: z.uuid().nullable(),
    amountCents: z.number().int().min(1).max(MAX_RECORD_CENTS).nullable(),
    date: z.string().regex(isoDatePattern).nullable(),
    reason: text(1000).nullable(),
    sourceQuotes: z.array(text(1000)).max(8),
    needsReview: z.boolean(),
    issues: z.array(text(300)).max(8),
  }),
  draft_reminder: z.strictObject({ body: text(2000) }),
  suggest_import_mapping: z.strictObject({
    fields: z.strictObject({
      externalId: tempColumnId.nullable(),
      number: tempColumnId.nullable(),
      amount: tempColumnId.nullable(),
      dueDate: tempColumnId.nullable(),
      customer: tempColumnId.nullable(),
      payee: tempColumnId.nullable(),
      label: tempColumnId.nullable(),
      typeColumn: tempColumnId.nullable(),
      paidAmount: tempColumnId.nullable(),
      openBalance: tempColumnId.nullable(),
      status: tempColumnId.nullable(),
    }),
    unresolved: z.array(z.enum(requiredMappingRoles)).max(requiredMappingRoles.length),
  }),
  extract_record: z.strictObject({
    proposals: z.array(z.strictObject({
      kind: z.enum(["invoice", "expense"]),
      number: text(100).nullable(),
      label: text(200).nullable(),
      party: text(200).nullable(),
      amountCents: z.number().int().min(1).max(MAX_RECORD_CENTS).nullable(),
      dueDate: z.string().regex(isoDatePattern).nullable(),
      sourceQuotes: z.array(text(1000)).max(8),
      issues: z.array(text(300)).max(8),
      needsReview: z.boolean(),
    })).max(3),
  }),
};
type Version = { sourceRevision: number };
export type AiProposal =
  | (z.infer<typeof aiOutputSchemas.explain> & Version & { task: "explain" })
  | (z.infer<typeof aiOutputSchemas.extract_reply> & Version & { task: "extract_reply" })
  | (z.infer<typeof aiOutputSchemas.draft_reminder> & Version & { task: "draft_reminder"; invoiceId: string; recipient: string })
  | (z.infer<typeof aiOutputSchemas.suggest_import_mapping> & Version & { task: "suggest_import_mapping" })
  | ({
      task: "extract_record";
      sourceRevision: number;
      proposals: (z.infer<typeof aiOutputSchemas.extract_record>["proposals"][number] & {
        customerId: string | null;
      })[];
    });

export function buildAiContext(workspace: WorkspaceSnapshot, request: AiRequest) {
  if (workspace.revision !== request.expectedRevision) throw new Error("STALE_VERSION");
  if (request.task === "suggest_import_mapping") return { allowedRecordIds: [] as string[], data: { headers: request.headers, samples: request.samples } };
  if (request.task === "extract_record") {
    return {
      allowedRecordIds: [] as string[],
      data: {
        customers: workspace.customers.map(c => ({ id: c.id, name: c.name })),
        referenceDate: workspace.forecastInput.referenceDate,
      },
    };
  }
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

export function recordTextAmounts(sourceText: string): Set<number> {
  const amounts = new Set<number>();
  const shorthandPattern = /(?:\bPHP\s*|₱\s*)?([+-]?\d+(?:\.\d+)?)\s*([kKmM])\b/gi;
  for (const match of sourceText.matchAll(shorthandPattern)) {
    try {
      const expanded = expandAmountShorthand(match[0]);
      amounts.add(parseMoney(expanded));
    } catch {}
  }
  for (const amt of phpAmounts(sourceText)) {
    if (amt !== null) amounts.add(amt);
  }
  const plainPattern = /(?<![\p{L}\p{N}_./-])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\p{L}\p{N}_/-])/gu;
  for (const match of sourceText.matchAll(plainPattern)) {
    try {
      amounts.add(parseMoney(match[1].replaceAll(",", "")));
    } catch {}
  }
  return amounts;
}

function matchesReplyValue<T>(value: T, replyValues: Set<T>, quoteValues: Set<T>) {
  return replyValues.size === 1 && replyValues.has(value) && quoteValues.size === 1 && quoteValues.has(value);
}

export function validateAiProposal(request: AiRequest, value: unknown, workspace: WorkspaceSnapshot): AiProposal {
  const context = buildAiContext(workspace, request);
  const sourceRevision = workspace.revision;
  if (request.task === "suggest_import_mapping") {
    const result = aiOutputSchemas.suggest_import_mapping.parse(value);
    const allowed = new Set(request.headers.map(header => header.id));
    for (const id of Object.values(result.fields)) if (id !== null && !allowed.has(id)) throw new Error("INVALID_AI_OUTPUT");
    const assigned = new Map<string, string[]>();
    for (const [role, id] of Object.entries(result.fields)) if (id) assigned.set(id, [...(assigned.get(id) ?? []), role]);
    if ([...assigned.values()].some(roles => roles.length > 1 && !(roles.length === 2 && roles.includes("externalId") && roles.includes("number")))) throw new Error("INVALID_AI_OUTPUT");
    const unresolved = requiredMappingRoles.filter(role => result.fields[role] === null);
    if (unresolved.length !== result.unresolved.length || unresolved.some(role => !result.unresolved.includes(role))) throw new Error("INVALID_AI_OUTPUT");
    return { ...result, task: request.task, sourceRevision };
  }
  if (request.task === "explain") {
    const result = aiOutputSchemas.explain.parse(value);
    if (result.recordIds.some(id => !context.allowedRecordIds.includes(id))) throw new Error("INVALID_AI_OUTPUT");
    return { ...result, task: request.task, sourceRevision };
  }
  if (request.task === "extract_record") {
    const result = aiOutputSchemas.extract_record.parse(value);
    const textAmounts = recordTextAmounts(request.text);
    const textDates = fullIsoDates(request.text);

    const proposals = result.proposals.slice(0, 3).map((item) => {
      const issues = [...item.issues];
      const validQuotes = item.sourceQuotes.filter(q => request.text.includes(q));
      if (validQuotes.length !== item.sourceQuotes.length) {
        issues.push("Some quoted snippets were not found in the original text.");
      }

      let amountCents = item.amountCents;
      if (amountCents !== null) {
        if (!textAmounts.has(amountCents)) {
          amountCents = null;
          issues.push("Confirm one exact amount. The amount must match the original text and its quoted wording.");
        }
      } else {
        issues.push("Amount could not be determined from the text.");
      }

      let dueDate = item.dueDate;
      if (dueDate !== null) {
        try {
          assertLocalDate(dueDate);
          const hasIsoInText = textDates.has(dueDate);
          const hasDateInQuotes = validQuotes.some(quote =>
            fullIsoDates(quote).has(dueDate!) ||
            /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\/\d{1,2})\b/i.test(quote),
          );
          if (!hasIsoInText && !hasDateInQuotes) {
            dueDate = null;
            issues.push("Confirm one exact date in YYYY-MM-DD format. The date must match the original text and its quoted wording.");
          }
        } catch {
          dueDate = null;
          issues.push("Confirm one exact date in YYYY-MM-DD format.");
        }
      } else {
        issues.push("Due date could not be determined from the text.");
      }

      let customerId: string | null = null;
      let party = item.party?.trim() || null;

      if (item.kind === "invoice") {
        if (party) {
          const matched = workspace.customers.find(
            c => c.name.trim().toLowerCase() === party!.toLowerCase(),
          );
          if (matched) {
            customerId = matched.id;
            party = matched.name;
          } else {
            issues.push(`Customer "${party}" is not in your business. Add the customer or select one in the form.`);
          }
        } else {
          issues.push("Customer name could not be determined from the text.");
        }
        if (!item.number) {
          issues.push("Invoice number could not be determined from the text.");
        }
      } else {
        if (!item.label) {
          issues.push("Expense label could not be determined from the text.");
        }
        if (!party) {
          issues.push("Payee could not be determined from the text.");
        }
      }

      const needsReview = item.needsReview || issues.length > 0;
      return {
        ...item,
        amountCents,
        dueDate,
        customerId,
        party,
        sourceQuotes: validQuotes,
        issues,
        needsReview,
      };
    });

    return {
      task: request.task,
      sourceRevision,
      proposals,
    };
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
