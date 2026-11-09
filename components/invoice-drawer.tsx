"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { InvoiceListItem } from "@/lib/ui/cash-overview";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { DashboardIcon } from "./dashboard-icon";

const STATE = { overdue: "Overdue", open: "Open", paid: "Paid" } as const;

/** "Review invoices" opens every invoice in a side panel on the Overview; each one opens its own review page. */
export function InvoiceDrawer({ invoices }: { invoices: InvoiceListItem[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const close = () => dialog.current?.close();
  const term = query.trim().toLowerCase();
  const shown = term ? invoices.filter((item) => `${item.number} ${item.customer}`.toLowerCase().includes(term)) : invoices;
  const unpaid = invoices.filter((item) => item.state !== "paid");
  const overdue = invoices.filter((item) => item.state === "overdue").length;

  return (
    <>
      <button type="button" className="row-action section-action" aria-haspopup="dialog" onClick={() => { setQuery(""); dialog.current?.showModal(); }}>
        Review invoices<DashboardIcon name="arrowRight" size={15} />
      </button>
      <dialog ref={dialog} className="invoice-drawer" aria-labelledby="invoice-drawer-title"
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className="drawer-body">
          <header className="drawer-head">
            <div>
              <h2 id="invoice-drawer-title">All invoices <span className="next-count">{invoices.length}</span></h2>
              <p>{formatPHP(checkedSum(unpaid.map((item) => item.outstandingCents)))} unpaid{overdue ? ` · ${overdue} overdue` : ""}</p>
            </div>
            <button type="button" className="icon-button drawer-close" aria-label="Close invoice list" onClick={close}>×</button>
          </header>
          <label className="drawer-search">
            <DashboardIcon name="search" size={16} />
            <input type="search" placeholder="Find an invoice or customer" aria-label="Find an invoice or customer" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {shown.length ? (
            <ul className="drawer-list" aria-label="Invoices">
              {shown.map((item) => (
                <li key={item.id}>
                  <Link href={`/invoices/${item.id}?from=overview`} onNavigate={close} className="drawer-row">
                    <span className="drawer-row-main"><strong>{item.number}</strong><small>{item.customer}</small></span>
                    <span className="drawer-row-due">{item.state === "paid" ? "Paid in full" : `Due ${formatPlanDate(item.dueDate, true)}`}</span>
                    <span className="drawer-row-amount num">{formatPHP(item.state === "paid" ? item.totalCents : item.outstandingCents)}</span>
                    <span className={`drawer-chip is-${item.state}`}>{STATE[item.state]}</span>
                    <DashboardIcon name="arrowRight" size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="drawer-empty">{invoices.length ? "No invoice matches that search." : "No invoices yet. Add one from Add records."}</p>}
          <footer className="drawer-foot">
            <Link href="/invoices" onNavigate={close} className="text-link">Open the Invoices page for filters and customers</Link>
          </footer>
        </div>
      </dialog>
    </>
  );
}
