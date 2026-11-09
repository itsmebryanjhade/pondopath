import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPlanDate } from "@/lib/display";
import { formatPHP } from "@/lib/domain/money";

/** Amounts in headlines drop a trailing ".00" but keep real centavos. */
const peso = (cents: number) => formatPHP(cents).replace(/\.00$/, "");

export type NextAction = {
  id: string;
  kind: "missed_promise" | "followup" | "missing_expectation" | "reminder_review" | "intake_review";
  /** The saved task text (or a fixed description); kept for screen readers and the follow-up ledger. */
  title: string;
  /** Short plain headline with the customer and amount, shown first. */
  headline: string;
  detail: string;
  /** A person's own follow-up instruction, shown under the headline when it adds something. */
  note?: string;
  href: string;
  assigneeId: string | null;
  dueDate: string | null;
  ownerReviewRequired: boolean;
};

export function buildNextActions(workspace: WorkspaceSnapshot): NextAction[] {
  const referenceDate = workspace.forecastInput.referenceDate;
  const invoiceById = new Map(workspace.invoices.map((invoice) => [invoice.id, invoice]));
  const customerById = new Map(workspace.customers.map((customer) => [customer.id, customer]));
  const forecastInvoiceById = new Map(workspace.forecastInput.invoices.map((invoice) => [invoice.id, invoice]));
  const ownerId = workspace.members.find((member) => member.role === "owner")?.user_id ?? null;
  const openFollowups = workspace.followups.filter((task) => task.state === "open");
  const followupExpectationIds = new Set(openFollowups.flatMap((task) => task.expectation_id ? [task.expectation_id] : []));
  const missedPromises = workspace.expectations.filter((expectation) => {
    const invoice = invoiceById.get(expectation.invoice_id);
    return expectation.kind === "commitment" && expectation.state === "active" &&
      expectation.expected_date < referenceDate && expectation.remaining_cents > 0 &&
      !!invoice && invoice.outstanding_cents > 0;
  });
  const missedById = new Map(missedPromises.map((expectation) => [expectation.id, expectation]));
  const items: NextAction[] = [];

  for (const task of openFollowups) {
    const invoice = invoiceById.get(task.invoice_id);
    if (!invoice || invoice.outstanding_cents <= 0) continue;
    const missedPromise = task.expectation_id ? missedById.get(task.expectation_id) : undefined;
    const customer = customerById.get(invoice.customer_id);
    items.push({
      id: `followup:${task.id}`,
      kind: missedPromise ? "missed_promise" : "followup",
      title: task.next_action,
      headline: missedPromise
        ? `Check if ${customer?.name ?? "the customer"} paid ${peso(missedPromise.remaining_cents)}`
        : `Follow up with ${customer?.name ?? "the customer"} on ${peso(invoice.outstanding_cents)}`,
      // The headline already says "check if they paid" for a missed promise, so only plain follow-ups show the person's note.
      ...(task.automatic_type || missedPromise ? {} : { note: task.next_action }),
      detail: missedPromise
        ? `${invoice.number} · promised ${formatPlanDate(missedPromise.expected_date, true)}`
        : `${invoice.number} · ${customer?.name ?? "Customer unavailable"}`,
      href: `/invoices/${invoice.id}`,
      assigneeId: workspace.members.some((member) => member.user_id === task.assignee_id) ? task.assignee_id : null,
      dueDate: task.due_date || null,
      ownerReviewRequired: false,
    });
  }

  for (const expectation of missedPromises) {
    if (followupExpectationIds.has(expectation.id)) continue;
    const invoice = invoiceById.get(expectation.invoice_id);
    if (!invoice) continue;
    items.push({
      id: `missed-promise:${expectation.id}`,
      kind: "missed_promise",
      title: "Follow up on the missed payment promise",
      headline: `Check if ${customerById.get(invoice.customer_id)?.name ?? "the customer"} paid ${peso(expectation.remaining_cents)}`,
      detail: `${invoice.number} · promised ${formatPlanDate(expectation.expected_date, true)}`,
      href: `/invoices/${invoice.id}`,
      assigneeId: null,
      dueDate: expectation.expected_date || null,
      ownerReviewRequired: false,
    });
  }

  for (const invoice of workspace.invoices) {
    if (invoice.outstanding_cents <= 0) continue;
    const forecastInvoice = forecastInvoiceById.get(invoice.id);
    if (!forecastInvoice || forecastInvoice.expectation) continue;
    const customer = customerById.get(invoice.customer_id);
    items.push({
      id: `missing-expectation:${invoice.id}`,
      kind: "missing_expectation",
      title: "Set an expected payment date",
      headline: `Ask ${customer?.name ?? "the customer"} when they'll pay ${peso(invoice.outstanding_cents)}`,
      detail: `${invoice.number} · No current expected receipt is recorded for ${customer?.name ?? "this customer"}.`,
      href: `/invoices/${invoice.id}`,
      assigneeId: null,
      dueDate: null,
      ownerReviewRequired: false,
    });
  }

  for (const reminder of workspace.reminders) {
    if (reminder.state !== "awaiting_review") continue;
    const invoice = invoiceById.get(reminder.invoice_id);
    if (!invoice) continue;
    items.push({
      id: `reminder-review:${reminder.id}`,
      kind: "reminder_review",
      title: "Review payment reminder",
      headline: `Approve the payment reminder to ${customerById.get(invoice.customer_id)?.name ?? "the customer"}`,
      detail: `${invoice.number} · Owner approval is required before this message can be copied.`,
      href: `/invoices/${invoice.id}`,
      assigneeId: ownerId,
      dueDate: invoice.due_date || null,
      ownerReviewRequired: true,
    });
  }

  for (const review of workspace.intakeReviews ?? []) {
    if (!["pending", "needs_match"].includes(review.status)) continue;
    items.push({ id: `intake:${review.id}`, kind: "intake_review", title: "Review an imported change", headline: "Review an imported row",
      detail: `Source row ${review.external_id} · ${review.status === "needs_match" ? "Needs matching or clarification." : "Not applied to your financial records."}`,
      href: `/imports?item=${review.id}#item-${review.id}`, assigneeId: null, dueDate: null, ownerReviewRequired: false });
  }

  return items.sort(
    (a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31") || a.id.localeCompare(b.id),
  );
}
