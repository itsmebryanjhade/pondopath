import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { calculateForecast } from "@/lib/domain/forecast";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";

export type MockChatReply = {
  text: string;
  sourceRevision: number;
  facts?: { label: string; value: string }[];
  sources?: { id: string; label: string; href: string }[];
  draft?: {
    kind: "reminder" | "followup";
    title: string;
    invoiceId: string;
    suggestedBody?: string;
    actionDate?: string;
    sourceRevision?: number;
  } | null;
};

export type ChatHistoryPair = {
  question: string;
  answer: string;
};

/**
 * Extracts completed (question, answer) pairs from message history,
 * keeping at most `maxPairs` (default 3), trimmed oldest first, and bounds
 * the serialized byte length to stay within the 16 KiB total request budget.
 */
export function trimChatHistory(
  messages: readonly { role: string; text: string }[],
  maxPairs = 3,
  maxBytes = 14 * 1024
): ChatHistoryPair[] {
  const pairs: ChatHistoryPair[] = [];
  let currentQuestion: string | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      currentQuestion = msg.text.trim();
    } else if (msg.role === "assistant" && currentQuestion !== null) {
      const answer = msg.text.trim();
      if (currentQuestion && answer) {
        pairs.push({ question: currentQuestion, answer });
      }
      currentQuestion = null;
    }
  }

  let trimmed = pairs.slice(-maxPairs);

  while (trimmed.length > 0) {
    const encoded = new TextEncoder().encode(JSON.stringify(trimmed));
    if (encoded.length <= maxBytes) {
      break;
    }
    trimmed = trimmed.slice(1);
  }

  return trimmed;
}

export function generatePageStarters(pathname: string): string[] {
  if (pathname.startsWith("/forecast")) {
    return [
      "Explain our first projected shortage",
      "Why is cash dipping in the forecast?",
      "Which week has the lowest projected balance?",
    ];
  }
  if (pathname.startsWith("/invoices")) {
    return [
      "Which customer owes the most right now?",
      "How many invoices are overdue?",
      "Draft a payment reminder for open invoices",
    ];
  }
  if (pathname.startsWith("/expenses")) {
    return [
      "What supplier bills are due this week?",
      "Which payee has our largest upcoming bill?",
      "How much total cash do we owe in bills?",
    ];
  }
  if (pathname.startsWith("/cash")) {
    return [
      "What is our recorded available cash?",
      "How much is expected but not cash yet?",
      "What was our opening cash balance?",
    ];
  }
  if (pathname.startsWith("/followups")) {
    return [
      "What follow-ups are overdue?",
      "Which customer accounts need immediate attention?",
      "Plan an invoice follow-up task",
    ];
  }
  return [
    "What should I do first?",
    "How much cash will we have in 30 days?",
    "Explain our first cash shortage",
  ];
}

export function generateMockReply(prompt: string, workspace: WorkspaceSnapshot): MockChatReply {
  const p = prompt.toLowerCase();
  const unpaidInvoices = workspace.invoices.filter((i) => i.outstanding_cents > 0);
  const targetInvoice = unpaidInvoices[0] || workspace.invoices[0];
  const targetCustomer = targetInvoice
    ? workspace.customers.find((c) => c.id === targetInvoice.customer_id)
    : undefined;

  // Reminder request
  if (p.includes("reminder") || p.includes("follow-up message")) {
    if (!targetInvoice) {
      return {
        text: "There are no unpaid invoices to prepare a reminder for.",
        sourceRevision: workspace.revision,
      };
    }
    const customerName = targetCustomer?.name || "Customer";
    return {
      text: `Here is a drafted reminder for ${targetInvoice.number} (${customerName}):`,
      sourceRevision: workspace.revision,
      facts: [
        { label: "Invoice", value: targetInvoice.number },
        { label: "Outstanding", value: formatPHP(targetInvoice.outstanding_cents) },
        { label: "Due Date", value: formatPlanDate(targetInvoice.due_date) },
      ],
      sources: [
        { id: targetInvoice.id, label: targetInvoice.number, href: `/invoices/${targetInvoice.id}` },
      ],
      draft: {
        kind: "reminder",
        title: `Payment reminder for ${targetInvoice.number}`,
        invoiceId: targetInvoice.id,
        suggestedBody: `Hi ${targetCustomer?.contact_name || customerName}, just a gentle follow-up regarding invoice ${targetInvoice.number} for ${formatPHP(targetInvoice.outstanding_cents)}, which was due on ${formatPlanDate(targetInvoice.due_date)}. Please let us know when payment can be expected. Thank you!`,
        sourceRevision: workspace.revision,
      },
    };
  }

  // Follow-up task request
  if (p.includes("plan") || p.includes("task") || p.includes("action")) {
    if (!targetInvoice) {
      return {
        text: "No open invoices found to plan a follow-up task for.",
        sourceRevision: workspace.revision,
      };
    }
    return {
      text: `Here is a proposed next action for ${targetInvoice.number}:`,
      sourceRevision: workspace.revision,
      facts: [
        { label: "Invoice", value: targetInvoice.number },
        { label: "Outstanding", value: formatPHP(targetInvoice.outstanding_cents) },
      ],
      sources: [
        { id: targetInvoice.id, label: targetInvoice.number, href: `/invoices/${targetInvoice.id}` },
      ],
      draft: {
        kind: "followup",
        title: `Follow up with ${targetCustomer?.name || "customer"} on ${targetInvoice.number}`,
        invoiceId: targetInvoice.id,
        suggestedBody: `Call ${targetCustomer?.contact_name || "contact"} to confirm payment date for ${targetInvoice.number}.`,
        actionDate: workspace.forecastInput.referenceDate,
        sourceRevision: workspace.revision,
      },
    };
  }

  // Cash / shortage / general question
  const forecast = calculateForecast(workspace.forecastInput);
  const facts = [
    { label: "Recorded available cash", value: formatPHP(workspace.forecastInput.availableCents) },
    { label: "30-day projected closing cash", value: formatPHP(forecast.days[29].closingCents) },
  ];
  if (forecast.firstShortage) {
    facts.push({
      label: "First baseline shortage",
      value: `${formatPHP(forecast.firstShortage.shortfallCents)} on ${formatPlanDate(forecast.firstShortage.date)}`,
    });
  }

  const sources = unpaidInvoices.slice(0, 3).map((inv) => ({
    id: inv.id,
    label: inv.number,
    href: `/invoices/${inv.id}`,
  }));

  return {
    text: forecast.firstShortage
      ? `Based on your entered records, cash is projected to drop below zero on ${formatPlanDate(forecast.firstShortage.date)} with a shortfall of ${formatPHP(forecast.firstShortage.shortfallCents)}. Collecting on overdue customer invoices will help cover upcoming bills.`
      : `Your cash position is currently stable over the next 30 days with a projected closing balance of ${formatPHP(forecast.days[29].closingCents)}.`,
    sourceRevision: workspace.revision,
    facts,
    sources,
  };
}

type AdapterMessagePart = { type: string; text?: string };
type AdapterMessage = { role?: string; content: string | readonly AdapterMessagePart[] };

export function createIsolatedChatModelAdapter(workspace: WorkspaceSnapshot) {
  return {
    run: async function* ({
      messages,
      abortSignal,
    }: {
      messages: readonly AdapterMessage[];
      abortSignal?: AbortSignal;
    }) {
      if (abortSignal?.aborted) {
        return;
      }
      const last = messages[messages.length - 1];
      let query = "";
      if (typeof last?.content === "string") {
        query = last.content;
      } else if (Array.isArray(last?.content)) {
        const textPart = last.content.find((p) => p.type === "text");
        query = textPart?.text || "";
      }
      const reply = generateMockReply(query, workspace);
      if (abortSignal?.aborted) {
        return;
      }
      yield {
        content: [{ type: "text" as const, text: reply.text }],
      };
    },
  };
}
