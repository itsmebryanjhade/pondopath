"use client";

import { useState } from "react";
import Link from "next/link";
import type { HistoryRow } from "@/lib/ui/cash-overview";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { DashboardIcon } from "./dashboard-icon";

type Filter = "all" | "in" | "out" | "voided";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" }, { value: "in", label: "Money in" }, { value: "out", label: "Money out" }, { value: "voided", label: "Voided" },
];
const matches = (row: HistoryRow, filter: Filter) =>
  filter === "all" || (filter === "voided" ? row.voided : !row.voided && row.direction === filter);

/** Every recorded payment on the Cash ledger, newest first. Each row opens its record, where a wrong entry is voided. */
export function PaymentHistory({ rows, capped }: { rows: HistoryRow[]; capped: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((row) => matches(row, filter));
  return (
    <>
      <div className="mini-chart-head">
        <div><h2 id="payment-history-heading">Payment history</h2><span>Newest first. Voided payments stay listed but don&rsquo;t count.</span></div>
      </div>
      {rows.length > 0 && <div className="history-filters" role="group" aria-label="Show payments">
        {FILTERS.map((item) => {
          const count = rows.filter((row) => matches(row, item.value)).length;
          return <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
            {item.label}<span className="history-count">{count}</span>
          </button>;
        })}
      </div>}
      {shown.length ? <ul className="history-list">
        {shown.map((row) => <li key={row.id}>
          <Link className={`history-row is-${row.direction}${row.voided ? " is-voided" : ""}`} href={row.href}
            aria-label={`${row.direction === "in" ? "Money in from" : "Money out to"} ${row.who}, ${formatPHP(row.amountCents)}, ${formatPlanDate(row.paymentDate)}${row.voided ? ", voided" : ""}`}>
            <span className="history-icon" aria-hidden="true"><DashboardIcon name={row.direction === "in" ? "arrowIn" : "arrowOut"} size={16} /></span>
            <span className="history-main">
              <strong>{row.who}</strong>
              <small>{row.what} · {formatPlanDate(row.paymentDate, true)}{row.reference ? ` · Ref ${row.reference}` : ""}</small>
              {row.voided && <small className="history-void">Voided{row.voidReason ? `: ${row.voidReason}` : ""}</small>}
            </span>
            <strong className="history-amount num">{row.direction === "in" ? "+" : "−"}{formatPHP(row.amountCents)}</strong>
            <DashboardIcon name="arrowRight" size={14} />
          </Link>
        </li>)}
      </ul> : rows.length
        ? <p className="empty-state">No payments match this filter.</p>
        : <div className="history-empty">
          <p>No payments recorded yet. Record one only after the money has really moved.</p>
          <div><Link className="row-action" href="/invoices?filter=unpaid">Record money received<DashboardIcon name="arrowRight" size={14} /></Link><Link className="row-action" href="/expenses">Record a bill paid<DashboardIcon name="arrowRight" size={14} /></Link></div>
        </div>}
      {capped && <p className="cash-history-note">Showing the latest 50 of each kind. Older ones are on each invoice&rsquo;s page and on Expenses.</p>}
    </>
  );
}
