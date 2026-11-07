import type { ReactNode } from "react";
import Link from "next/link";
import type { getCashMovements, WorkspaceSnapshot } from "@/lib/server/workspace";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { calculateForecast } from "@/lib/domain/forecast";
import { expectedReceipts, historyRows } from "@/lib/ui/cash-overview";
import { PaymentHistory } from "./payment-history";
import { JumpLink } from "./jump-link";
import { DashboardIcon } from "./dashboard-icon";
import { RefreshRecords } from "./refresh-records";
import { WorkspaceShell } from "./workspace-shell";

export function CashPosition({ workspace, receipts, payments, openingControls }: {
  workspace: WorkspaceSnapshot;
  receipts: Awaited<ReturnType<typeof getCashMovements>>;
  payments: Awaited<ReturnType<typeof getCashMovements>>;
  openingControls: ReactNode;
}) {
  const locked = !!workspace.business.opening_locked_at;
  // Snapshot totals, not the limited recent-movement lists. Shown once, in the "How your cash adds up" strip.
  const receivedCents = checkedSum(workspace.invoices.map((invoice) => invoice.paid_cents));
  const paidOutCents = checkedSum(workspace.expenses.map((expense) => expense.paid_cents));
  // Money on its way: what the forecast expects from customers, kept apart from available cash.
  const expected = expectedReceipts(workspace, calculateForecast(workspace.forecastInput));
  const expectedTotal = checkedSum(expected.map((item) => item.amountCents));

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

    <section className="section-feature" aria-label="Available cash and recent movements">
      <div className="section-feature-copy">
        <span>Recorded available cash</span>
        <strong className="num">{formatPHP(workspace.forecastInput.availableCents)}</strong>
        <p>Only money you&rsquo;ve checked. Customer promises don&rsquo;t count until they&rsquo;re paid.</p>
      </div>
      <section className="mini-chart cash-recent" id="payment-history" aria-labelledby="payment-history-heading">
        <PaymentHistory rows={historyRows(workspace, [...receipts, ...payments])} capped={receipts.length >= 50 || payments.length >= 50} />
      </section>
    </section>

    <section className="section-lower-grid">
      <section id="opening-cash" className="records-panel opening-cash" aria-labelledby="opening-cash-heading">
        <div className="opening-body">
          <div className="opening-id">
            <span className="opening-icon" aria-hidden="true"><DashboardIcon name="wallet" size={20} /></span>
            <div>
              <h2 id="opening-cash-heading">Opening cash</h2>
              <strong className="num">{formatPHP(workspace.business.opening_cash_cents)}</strong>
              <span>Your cash count starts here, on {formatPlanDate(workspace.business.opening_date)}</span>
            </div>
          </div>
          <div className="opening-side">
            <span className={`opening-status${locked ? " is-locked" : ""}`}>{locked ? "Locked" : "Can still change"}</span>
            {!locked && workspace.actor.role !== "owner" && <p className="opening-note">Only the owner can change opening cash.</p>}
          </div>
          {!locked && workspace.actor.role === "owner" && openingControls}
          <div className="opening-math" aria-labelledby="opening-math-title">
            <p id="opening-math-title" className="opening-math-title">How your available cash is worked out</p>
            <ol>
              <li className="step is-start"><span className="step-icon" aria-hidden="true"><DashboardIcon name="wallet" size={16} /></span><span className="step-label">Opening cash</span><strong className="num">{formatPHP(workspace.business.opening_cash_cents)}</strong><small>What you started with</small></li>
              <li className="op" aria-label="plus">+</li>
              <li className="step is-in"><span className="step-icon" aria-hidden="true"><DashboardIcon name="arrowIn" size={16} /></span><span className="step-label">Received</span><strong className="num">{formatPHP(receivedCents)}</strong><small>Customer payments you checked</small></li>
              <li className="op" aria-label="minus">&minus;</li>
              <li className="step is-out"><span className="step-icon" aria-hidden="true"><DashboardIcon name="arrowOut" size={16} /></span><span className="step-label">Paid out</span><strong className="num">{formatPHP(paidOutCents)}</strong><small>Bills you paid</small></li>
              <li className="op" aria-label="equals">=</li>
              <li className={`step is-total${workspace.forecastInput.availableCents < 0 ? " is-negative" : ""}`}><span className="step-icon" aria-hidden="true"><DashboardIcon name="check" size={16} /></span><span className="step-label">Available now</span><strong className="num">{formatPHP(workspace.forecastInput.availableCents)}</strong><small>Cash you have today</small></li>
            </ol>
            <p className="opening-note">{locked
              ? <>Locked because a payment has been recorded. To fix a wrong payment, open it in <JumpLink target="payment-history">Payment history</JumpLink> and void it there.</>
              : "You can change opening cash until your first payment is recorded. After that it locks."}</p>
          </div>
        </div>
      </section>
      <aside className="section-ai-card not-cash-yet" aria-labelledby="not-cash-yet-heading">
        <span><DashboardIcon name="calendar" size={15} />Not cash yet</span>
        <h2 id="not-cash-yet-heading">{expected.length ? <><strong className="num">{formatPHP(expectedTotal)}</strong> expected</> : "Nothing expected yet"}</h2>
        <p>{expected.length
          ? `From ${expected.length} ${expected.length === 1 ? "invoice" : "invoices"} in the next 30 days. It isn't in your available cash until you record the payment.`
          : "No customer payments are expected in the next 30 days. Set expected dates on your invoices to see them here."}</p>
        {expected.length > 0 && <ul className="expected-list">
          {expected.slice(0, 3).map((item) => <li key={item.id}>
            <Link href={`/invoices/${item.id}`} aria-label={`${item.number}, ${item.customer}, ${formatPHP(item.amountCents)} expected ${formatPlanDate(item.date)}`}>
              <span><strong>{item.number}</strong><small>{item.customer}</small></span>
              <span className="expected-amount"><strong className="num">{formatPHP(item.amountCents)}</strong><small>{formatPlanDate(item.date, true)}</small></span>
              <DashboardIcon name="arrowRight" size={14} />
            </Link>
          </li>)}
        </ul>}
        {expected.length > 3 && <p className="expected-more">and {expected.length - 3} more</p>}
        <Link className="cash-plan-link" href={expected.length ? "/forecast" : "/invoices"}>{expected.length ? "See the 30-day forecast" : "Open invoices"} <DashboardIcon name="arrowRight" size={15} /></Link>
      </aside>
    </section>
  </WorkspaceShell>;
}
