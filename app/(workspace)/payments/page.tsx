import Link from "next/link";
import { getCashMovements, getWorkspace } from "@/lib/server/workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { CashMovements } from "@/components/cash-movements";
import { DashboardIcon } from "@/components/dashboard-icon";
import { RefreshRecords } from "@/components/refresh-records";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";

export default async function PaymentsPage() {
  const workspace = await getWorkspace();
  const [receipts, payments] = await Promise.all([getCashMovements("receipt", workspace.revision), getCashMovements("expense_payment", workspace.revision)]);
  // The history readers return at most 50 entries; totals come from the complete snapshot.
  const metrics = [
    { label: "Verified customer receipts", value: checkedSum(workspace.invoices.map((invoice) => invoice.paid_cents)), note: "Since opening cutoff · excludes voids", tone: "green" },
    { label: "Verified expense payments", value: checkedSum(workspace.expenses.map((expense) => expense.paid_cents)), note: "Since opening cutoff · excludes voids", tone: "blue" },
    { label: "Opening cash baseline", value: workspace.business.opening_cash_cents, note: `Start of ${formatPlanDate(workspace.business.opening_date)}`, tone: "purple" },
  ];
  return <WorkspaceShell workspace={workspace} className="section-page section-payments payments-page" header={
    <header className="section-heading">
      <div><p className="eyebrow">Cash movements · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p><h1>Payments</h1><p>Verified cash movements and their retained correction history.</p></div>
      <div className="dashboard-heading-actions">
        <span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span>
        <RefreshRecords />
        <Link className="section-primary" href="/invoices?filter=unpaid"><DashboardIcon name="arrowIn" size={17} />Record a receipt</Link>
      </div>
    </header>
  }>
    <section className="section-feature" aria-label="Recorded cash and payment actions">
      <div className="section-feature-copy">
        <span>Recorded available cash</span><strong className="num">{formatPHP(workspace.forecastInput.availableCents)}</strong>
        <p>Opening cash + verified receipts − verified expense payments. Customer promises and pending reminders are excluded from this history.</p>
        <Link className="payment-source-link" href="/cash">Review cash position <DashboardIcon name="arrowRight" size={15} /></Link>
      </div>
      <div className="mini-chart">
        <div className="mini-chart-head"><div><strong>Record verified money</strong><span>Check the money first, then record it against its invoice or expense.</span></div></div>
        <div className="payment-action-list">
          <Link className="record-row" href="/invoices?filter=unpaid">
            <span className="record-icon"><DashboardIcon name="arrowIn" size={16} /></span>
            <div><strong>Customer receipt</strong><span>Open an unpaid invoice to record received money</span></div><DashboardIcon name="arrowRight" size={16} />
          </Link>
          <Link className="record-row" href="/expenses">
            <span className="record-icon record-1"><DashboardIcon name="arrowOut" size={16} /></span>
            <div><strong>Expense payment</strong><span>Open an expense to record money already paid</span></div><DashboardIcon name="arrowRight" size={16} />
          </Link>
        </div>
        <p className="payment-note">Partial payments update the remaining balance. Only the owner can void an incorrect entry; its history is retained.</p>
      </div>
    </section>
    <section className="section-lower-grid" aria-label="Retained payment history">
      <div className="records-panel payment-history-card" role="region" aria-label="Customer receipt history" tabIndex={0}><CashMovements workspace={workspace} movements={receipts} kind="receipt" /></div>
      <div className="records-panel payment-history-card" role="region" aria-label="Expense payment history" tabIndex={0}><CashMovements workspace={workspace} movements={payments} kind="expense_payment" /></div>
    </section>
    <section className="section-metrics" aria-label="Verified movement totals">
      {metrics.map(({ label, value, note, tone }) => <article className="section-metric" key={label}>
        <span className={`metric-mark ${tone}`} aria-hidden="true" /><p>{label}</p><strong className="num">{formatPHP(value)}</strong><small>{note}</small>
      </article>)}
    </section>
  </WorkspaceShell>;
}
