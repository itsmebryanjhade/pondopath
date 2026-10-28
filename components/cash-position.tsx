import type { ReactNode } from "react";
import Link from "next/link";
import type { getCashMovements, WorkspaceSnapshot } from "@/lib/server/workspace";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { DashboardIcon } from "./dashboard-icon";
import { RefreshRecords } from "./refresh-records";
import { WorkspaceShell } from "./workspace-shell";

export function CashPosition({ workspace, receipts, payments, openingControls }: {
  workspace: WorkspaceSnapshot;
  receipts: Awaited<ReturnType<typeof getCashMovements>>;
  payments: Awaited<ReturnType<typeof getCashMovements>>;
  openingControls: ReactNode;
}) {
  // Snapshot totals include all valid movements; the recent-entry queries are limited to 50 each.
  const metrics = [
    { label: "Opening cash baseline", value: workspace.business.opening_cash_cents, note: `Start of ${formatPlanDate(workspace.business.opening_date)}`, tone: "green" },
    { label: "Verified customer receipts", value: checkedSum(workspace.invoices.map((invoice) => invoice.paid_cents)), note: "Since the cutoff · voided entries excluded", tone: "blue" },
    { label: "Verified expense payments", value: checkedSum(workspace.expenses.map((expense) => expense.paid_cents)), note: "Since the cutoff · voided entries excluded", tone: "purple" },
  ];
  const recent = [...receipts, ...payments]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .slice(0, 5);

  return <WorkspaceShell workspace={workspace} className="section-page section-cash cash-page" header={
    <header className="section-heading">
      <div>
        <p className="eyebrow">Liquidity · {workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</p>
        <h1>Cash position</h1>
        <p>Recorded money available today, kept separate from expected customer payments.</p>
      </div>
      <div className="dashboard-heading-actions">
        <span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span>
        <RefreshRecords />
        <Link className="section-primary" href="/invoices?filter=unpaid"><DashboardIcon name="plus" size={17} />Record a receipt</Link>
      </div>
    </header>
  }>
    <section className="section-metrics" aria-label="Recorded cash breakdown">
      {metrics.map(({ label, value, note, tone }) => <article className="section-metric" key={label}>
        <span className={`metric-mark ${tone}`} aria-hidden="true" />
        <p>{label}</p><strong className="num">{formatPHP(value)}</strong><small>{note}</small>
      </article>)}
    </section>

    <section className="section-feature" aria-label="Available cash and recent movements">
      <div className="section-feature-copy">
        <span>Recorded available cash</span>
        <strong className="num">{formatPHP(workspace.forecastInput.availableCents)}</strong>
        <p>Opening cash + verified receipts − verified expense payments. Customer promises do not change this balance.</p>
        <Link className="cash-report-link" href="/payments">Review payment history <DashboardIcon name="arrowRight" size={15} /></Link>
      </div>
      <div className="mini-chart cash-recent">
        <div className="mini-chart-head">
          <div><strong>Recent cash movements</strong><span>Latest 5 entries by time recorded · includes retained voids</span></div>
          <span className="mini-chart-change">PHP</span>
        </div>
        {recent.length ? <ul className="record-list">
          {recent.map((movement) => {
            const isReceipt = movement.kind === "receipt";
            const parent = isReceipt
              ? workspace.invoices.find((invoice) => invoice.id === movement.invoice_id)?.number
              : workspace.expenses.find((expense) => expense.id === movement.expense_id)?.label;
            const status = movement.voided_at ? `Voided ${isReceipt ? "receipt" : "payment"}` : `Verified ${isReceipt ? "receipt" : "payment"}`;
            const href = isReceipt
              ? `/invoices/${movement.invoice_id}?movement=${movement.id}#movement-${movement.id}`
              : `/expenses#movement-${movement.id}`;
            return <li className="record-row" key={movement.id}>
              <span className={`record-icon${isReceipt ? "" : " record-1"}`} aria-hidden="true"><DashboardIcon name={isReceipt ? "arrowIn" : "arrowOut"} size={16} /></span>
              <div>
                <strong title={movement.reference || "No payment reference"}>{movement.reference || "No payment reference"}</strong>
                <span title={`${status} · ${formatPlanDate(movement.payment_date)} · ${parent ?? "Related record"}${movement.void_reason ? ` · ${movement.void_reason}` : ""}`}>{status} · {formatPlanDate(movement.payment_date)} · {parent ?? "Related record"}</span>
              </div>
              <strong className="record-amount num">{formatPHP(movement.amount_cents)}</strong>
              <span className={`record-status${movement.voided_at ? " status-1" : ""}`}>{movement.voided_at ? "Voided" : isReceipt ? "Cash in" : "Cash out"}</span>
              <Link className="cash-record-link" href={href} aria-label={`Open ${movement.reference || "payment record"}`}><DashboardIcon name="chevron" size={15} /></Link>
            </li>;
          })}
        </ul> : <p className="empty-state">No actual cash movements recorded yet. Record money only after checking that it was received or paid.</p>}
        <p className="cash-history-note">Voided entries remain visible for traceability and are excluded from the balance.</p>
      </div>
    </section>

    <section className="section-lower-grid">
      <section id="opening-cash" className="records-panel" aria-labelledby="opening-cash-heading">
        <div className="records-head"><div><h2 id="opening-cash-heading">Opening cash baseline</h2><p>Start of {formatPlanDate(workspace.business.opening_date)} · before that day’s movements</p></div><DashboardIcon name="wallet" size={18} /></div>
        <div className="cash-baseline-body">
          {workspace.business.opening_locked_at
            ? <p className="form-feedback">Locked after the first actual movement. Correct a mistaken movement by voiding its retained entry; a baseline reset is outside this workspace.</p>
            : workspace.actor.role === "owner" ? openingControls : <p className="form-feedback">Only the owner can set opening cash.</p>}
        </div>
      </section>
      <aside className="section-ai-card">
        <span><DashboardIcon name="wallet" size={15} />Cash rule</span>
        <h2>Expected is not received</h2>
        <p>Unpaid invoices and customer commitments belong in the cash plan. They become available cash only when a verified receipt is recorded.</p>
        <Link className="cash-plan-link" href="/forecast">Open the cash plan <DashboardIcon name="arrowRight" size={15} /></Link>
        <div className="source-note"><span>Based on</span><strong>Saved payment records</strong></div>
      </aside>
    </section>
  </WorkspaceShell>;
}
