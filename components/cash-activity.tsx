"use client";

import { useState } from "react";
import Link from "next/link";
import type { ActivityFilter, ActivityRow } from "@/lib/ui/cash-overview";
import { filterActivityRows } from "@/lib/ui/cash-overview";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { DashboardIcon } from "./dashboard-icon";

const filters: { value: ActivityFilter; label: string }[] = [{ value: "all", label: "All" }, { value: "invoices", label: "Invoices" }, { value: "expenses", label: "Expenses" }, { value: "attention", label: "Needs attention" }];

export function CashActivity({ rows }: { rows: ActivityRow[] }) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [page, setPage] = useState(1);
  const matching = filterActivityRows(rows, filter);
  const pages = Math.max(1, Math.ceil(matching.length / 6));
  const current = Math.min(page, pages);
  const visible = matching.slice((current - 1) * 6, current * 6);
  const attentionCount = rows.filter((row) => row.needsAttention).length;
  return (
    <section id="cash-activity" className="activity-panel" aria-labelledby="activity-heading">
      <div className="activity-head">
        <div><h2 id="activity-heading">Cash-flow activity</h2><p>Customer invoices and unpaid expenses that need a next step.</p></div>
        <Link className="text-link" href="/invoices">Review invoices <DashboardIcon name="arrowRight" size={16} /></Link>
      </div>
      <div className="table-tools">
        <div className="filter-tabs" role="group" aria-label="Filter cash-flow activity">
          {filters.map((item) => <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setPage(1); }}>{item.label}{item.value === "attention" && <span>{attentionCount}</span>}</button>)}
        </div>
        <p className="activity-key">Expected payments are not available cash</p>
      </div>
      <div className="table-scroll" role="region" aria-label="Cash-flow activity records" tabIndex={0}>
        <table className="activity-table">
          <caption className="sr-only">Unpaid customer invoices and expenses, with source records and reviewed receipt expectations</caption>
          <thead><tr><th scope="col">Customer / payee</th><th scope="col" className="num">Outstanding</th><th scope="col">Original due</th><th scope="col">Expected payment</th><th scope="col">Status</th><th scope="col">Next action</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={`${row.kind}-${row.id}`}>
            <th scope="row"><div className="activity-entity"><span className={`entity-icon ${row.kind}`}><DashboardIcon name={row.kind === "invoice" ? "receipt" : "arrowOut"} /></span><div><Link href={row.href}>{row.label}</Link><small>{row.reference}</small></div></div></th>
            <td className="num"><strong>{formatPHP(row.amountCents)}</strong><small>{row.kind === "invoice" ? "Invoice" : "Expense"}</small></td>
            <td>{formatPlanDate(row.dueDate)}</td><td>{row.expected}</td>
            <td><span className={`record-status ${row.tone}`}>{row.status}</span></td>
            <td><Link className="activity-action" href={row.href} aria-label={`Review ${row.kind}: ${row.reference}`}>Review {row.kind}<DashboardIcon name="arrowRight" size={14} /></Link></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!matching.length && <p className="empty-state">{rows.length ? "No records match this filter." : "No unpaid invoices or expenses entered. Use Quick add to start your cash plan."}</p>}
      <div className="table-foot"><p role="status">{matching.length ? `Showing ${(current - 1) * 6 + 1}–${Math.min(current * 6, matching.length)} of ${matching.length} items` : "0 items"}</p><div><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></div>
    </section>
  );
}
