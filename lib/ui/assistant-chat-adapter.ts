import { z } from "zod";
import { aiOutputSchemas, aiRequestSchema, type AiRequest, type AssistantChatRequest } from "@/lib/domain/ai";
import { assistantChatOutputSchema, type AssistantChatProposal } from "@/lib/domain/assistant-chat";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";

export type AssistantChatScope = Pick<AssistantChatRequest, "expectedRevision" | "language" | "context" | "intent">;
export type AssistantContextEntry = {
  context: NonNullable<AssistantChatScope["context"]>;
  workspace: WorkspaceSnapshot;
  starterText: string;
  intent?: AssistantChatScope["intent"];
};
type ChatMessage = {
  role: string;
  content: readonly { type: string; text?: string }[];
  status?: { type: string };
};
type ExtractionRequest = Extract<AiRequest, { task: "extract_reply" }>;

const maxBytes = 16_384;
const encoder = new TextEncoder();
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const unavailable = "The assistant is unavailable. Your message is retained.";
const stale = "Records changed. Refresh records before asking again.";
const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), proposal: z.unknown() }),
  z.object({ ok: z.literal(false), code: z.string(), message: z.string().min(1).max(1000) }),
]);
const sourceSchema = z.strictObject({
  id: z.uuid(), kind: z.enum(["invoice", "expense"]), label: z.string(), href: z.string(),
}).refine(source => source.kind === "invoice"
  ? source.href === "/invoices/" + source.id
  : new RegExp("^/expenses(?:\\?page=[1-9]\\d{0,4})?#expense-" + source.id + "$").test(source.href));
const chatProposalSchema = z.strictObject({
  task: z.literal("chat"),
  sourceRevision: revision,
  ...assistantChatOutputSchema.pick({ kind: true, summary: true, draft: true }).shape,
  facts: z.array(z.strictObject({ id: z.string(), label: z.string(), value: z.string() })).max(14),
  sources: z.array(sourceSchema).max(13),
}).refine(proposal => !proposal.draft || (proposal.kind === "answer" &&
  proposal.sources.some(source => source.kind === "invoice" && source.id === proposal.draft?.invoiceId)));
const extractionProposalSchema = aiOutputSchemas.extract_reply.extend({
  task: z.literal("extract_reply"),
  sourceRevision: revision,
  issues: z.array(z.string()),
});

function messageText(message: ChatMessage) {
  return message.content.flatMap(part => part.type === "text" && part.text ? [part.text] : []).join("\n").trim();
}

export function buildAssistantChatRequest(messages: readonly ChatMessage[], scope: AssistantChatScope): AssistantChatRequest {
  const last = messages.at(-1);
  const question = last?.role === "user" ? messageText(last) : "";
  const pairs: AssistantChatRequest["history"] = [];
  let previousQuestion = "";
  for (const message of messages.slice(0, -1)) {
    if (message.role === "user") previousQuestion = messageText(message);
    if (message.role !== "assistant") continue;
    const answer = message.status?.type === "complete" ? messageText(message) : "";
    if (previousQuestion && previousQuestion.length <= 1000 && answer && answer.length <= 3000) {
      pairs.push({ question: previousQuestion, answer });
    }
    previousQuestion = "";
  }
  const input: AssistantChatRequest = { ...scope, task: "chat", question, history: pairs.slice(-3) };
  while (input.history.length && encoder.encode(JSON.stringify(input)).byteLength > maxBytes) input.history.shift();
  return input;
}

async function postAssistant(input: AssistantChatRequest | ExtractionRequest, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!aiRequestSchema.safeParse(input).success) throw new Error("Check the selected task and required fields.");
  const body = JSON.stringify(input);
  if (encoder.encode(body).byteLength > maxBytes) throw new Error("That message is too long. Shorten it and try again.");
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(35_000)]);
  const response = await fetch("/api/assistant", {
    method: "POST", credentials: "same-origin", redirect: "manual",
    headers: { "Content-Type": "application/json" }, body, signal: requestSignal,
  }).catch((error: unknown) => {
    signal.throwIfAborted();
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("The assistant timed out. Your message is retained.");
    throw new Error(unavailable);
  });
  requestSignal.throwIfAborted();
  if (response.redirected || response.type === "opaqueredirect" || response.status === 401 ||
      (response.status >= 300 && response.status < 400)) {
    throw new Error("Sign in again to use the assistant. Your message is retained.");
  }
  const envelope = envelopeSchema.safeParse(await response.json().catch(() => null));
  requestSignal.throwIfAborted();
  if (!envelope.success) throw new Error(unavailable);
  if (!envelope.data.ok) throw new Error(envelope.data.message);
  if (!response.ok) throw new Error(unavailable);
  return envelope.data.proposal;
}

export async function sendAssistantChat(messages: readonly ChatMessage[], scope: AssistantChatScope, signal: AbortSignal) {
  const input = buildAssistantChatRequest(messages, scope);
  const result = chatProposalSchema.safeParse(await postAssistant(input, signal));
  if (!result.success) throw new Error(unavailable);
  const proposal = result.data;
  if (proposal.sourceRevision !== scope.expectedRevision) throw new Error(stale);
  const selected = scope.context?.record;
  if (proposal.draft && ((scope.intent && scope.intent !== "draft_" + proposal.draft.kind) ||
      (selected && (selected.kind !== "invoice" || selected.id !== proposal.draft.invoiceId)))) {
    throw new Error(unavailable);
  }
  return proposal;
}

export async function sendReplyExtraction(input: ExtractionRequest, signal: AbortSignal) {
  const result = extractionProposalSchema.safeParse(await postAssistant(input, signal));
  if (!result.success) throw new Error(unavailable);
  if (result.data.sourceRevision !== input.expectedRevision) throw new Error(stale);
  if (result.data.invoiceId && result.data.invoiceId !== input.invoiceId) throw new Error(unavailable);
  return result.data;
}

export function resolveAssistantDraftTarget(workspace: WorkspaceSnapshot, proposal: AssistantChatProposal) {
  if (proposal.kind !== "answer" || !proposal.draft || workspace.revision !== proposal.sourceRevision) return null;
  const invoice = workspace.invoices.find(row => row.id === proposal.draft?.invoiceId && row.outstanding_cents > 0);
  const customer = invoice && workspace.customers.find(row => row.id === invoice.customer_id);
  return invoice && customer ? { invoice, customer } : null;
}

const pages = ["overview", "forecast", "cash", "invoices", "expenses", "followups"] as const;
export function assistantPage(pathname: string) {
  return pages.find(page => pathname === "/" + page || pathname.startsWith("/" + page + "/"));
}

function sameAssistantActor(left: WorkspaceSnapshot, right: WorkspaceSnapshot) {
  return left.business.id === right.business.id && left.actor.businessId === right.actor.businessId &&
    left.actor.userId === right.actor.userId && left.actor.role === right.actor.role;
}

export function assistantContextWorkspace(page: WorkspaceSnapshot | undefined, layout: WorkspaceSnapshot) {
  // The layout can retain an earlier snapshot across client navigation.
  return page && page.revision > layout.revision && sameAssistantActor(page, layout) ? page : layout;
}

export function assistantContextMatchesPath(entry: AssistantContextEntry, pathname: string) {
  const { page, record } = entry.context;
  return assistantPage(pathname) === page &&
    (page !== "invoices" || record?.kind !== "invoice" || pathname === "/invoices/" + record.id);
}

export function assistantContextProblem(entry: AssistantContextEntry, pathname: string, workspace: WorkspaceSnapshot) {
  if (!sameAssistantActor(entry.workspace, workspace)) return "This question belongs to another workspace.";
  if (entry.workspace.revision !== workspace.revision) return stale + " Reopen this question from the updated card.";
  const { page, record } = entry.context;
  if (assistantPage(pathname) !== page) return "This question belongs to another page. Open it there or start a new chat.";

  if (record?.kind === "invoice") {
    const invoice = workspace.invoices.find(row => row.id === record.id && row.business_id === workspace.business.id);
    if (!invoice || !assistantContextMatchesPath(entry, pathname)) {
      return "The selected invoice is unavailable. Open the question again from the invoice.";
    }
    if (page === "followups" && (invoice.outstanding_cents <= 0 ||
        !workspace.followups.some(task => task.invoice_id === invoice.id && task.business_id === workspace.business.id && task.state === "open"))) {
      return "This invoice no longer has an open follow-up. Open the question again from Follow-ups.";
    }
  }
}

export function generatePageStarters(pathname: string): string[] {
  if (pathname.startsWith("/invoices/")) {
    return ["How much is unpaid on this invoice?", "When was this invoice due?", "What payment is expected for this invoice?"];
  }
  switch (assistantPage(pathname)) {
    case "forecast":
      return ["Explain our first projected shortage", "Why is cash dipping in the forecast?", "What is the largest projected shortage?"];
    case "invoices":
      return ["Which customer owes the most right now?", "Which invoices are overdue?", "Which invoice should I follow up first?"];
    case "expenses":
      return ["What supplier bills are due this week?", "Which payee has our largest upcoming bill?", "How much cash is planned to go out?"];
    case "cash":
      return ["What is our recorded available cash?", "How much is expected but not cash yet?", "What is the projected closing cash?"];
    case "followups":
      return ["What should I do first?", "Which customer invoices need attention?", "What payments should I check?"];
    default:
      return ["What should I do first?", "How much cash will we have in 30 days?", "Explain our first cash shortage"];
  }
}
