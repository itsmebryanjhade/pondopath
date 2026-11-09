import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { checkedSum } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import type { ActivityRow } from "./cash-overview";

export type AlertGroupKey = "bills" | "collect" | "followups" | "review";
export type AlertItem = { id: string; title: string; detail: string; amountCents?: number; when: string; late: boolean; href: string };
export type AlertGroup = { key: AlertGroupKey; label: string; href: string; items: AlertItem[] };
export type Alerts = { count: number; urgent: boolean; overdueBillCents: number; overdueOwedCents: number; groups: AlertGroup[] };

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const lateText = (due: string, today: string) => {
  const days = daysBetween(due, today);
  return days === 1 ? "1 day late" : `${days} days late`;
};

/**
 * What the bell shows: things that need someone now, grouped by what they'd do about them.
 * Bills to pay (overdue), money to collect (overdue or missing a usable payment date), follow-ups due today or late,
 * and imported rows waiting in Review Inbox. It reads the same rows the workspace already shows; nothing is stored.
 */
export function buildAlerts(workspace: WorkspaceSnapshot, rows: ActivityRow[]): Alerts {
  const today = workspace.forecastInput.referenceDate;
  const bills = rows.filter((row) => row.kind === "expense" && row.needsAttention);
  const collect = rows.filter((row) => row.kind === "invoice" && row.needsAttention)
    .sort((a, b) => Number(b.tone === "overdue") - Number(a.tone === "overdue") || a.dueDate.localeCompare(b.dueDate));
  const tasks = workspace.followups
    .filter((task) => task.state === "open" && task.due_date <= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
  const inbox = workspace.intakeReviews?.length ?? 0;

  const groups: AlertGroup[] = [
    {
      key: "bills", label: "Bills to pay", href: "/expenses",
      items: bills.map((row) => ({ id: row.id, title: row.reference, detail: row.label, amountCents: row.amountCents, when: lateText(row.dueDate, today), late: true, href: row.href })),
    },
    {
      key: "collect", label: "Money to collect", href: "/invoices?filter=overdue",
      items: collect.map((row) => {
        const late = row.tone === "overdue";
        return { id: row.id, title: row.reference, detail: row.label, amountCents: row.amountCents, when: late ? lateText(row.dueDate, today) : "Needs a payment date", late, href: late ? row.href : `${row.href}?plan=edit#collection-plan` };
      }),
    },
    {
      key: "followups", label: "Follow-ups due", href: "/followups",
      items: tasks.map((task) => {
        const invoice = workspace.invoices.find((row) => row.id === task.invoice_id);
        const late = task.due_date < today;
        return { id: task.id, title: task.next_action, detail: invoice?.number ?? "Invoice", when: late ? `Late since ${formatPlanDate(task.due_date, true)}` : "Due today", late, href: `/invoices/${task.invoice_id}#followup-${task.id}` };
      }),
    },
    {
      key: "review", label: "To review", href: "/imports",
      items: inbox ? [{ id: "inbox", title: `${inbox} imported ${inbox === 1 ? "row" : "rows"} waiting`, detail: "Nothing counts until you confirm it", when: "", late: false, href: "/imports" }] : [],
    },
  ];
  const visible = groups.filter((group) => group.items.length);
  return {
    count: bills.length + collect.length + tasks.length + inbox,
    urgent: bills.length > 0 || collect.some((row) => row.tone === "overdue") || tasks.some((task) => task.due_date < today),
    overdueBillCents: checkedSum(bills.map((row) => row.amountCents)),
    overdueOwedCents: checkedSum(collect.filter((row) => row.tone === "overdue").map((row) => row.amountCents)),
    groups: visible,
  };
}
