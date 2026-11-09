"use client";

import { useId, useState, type KeyboardEvent } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { ExpenseForm, InvoiceForm } from "./record-forms";
import { PaymentForm } from "./payment-form";

export type EntryKind = "invoice" | "expense" | "receipt";
const TABS: { kind: EntryKind; label: string; hint: string }[] = [
  { kind: "invoice", label: "Invoice", hint: "Money a customer owes you" },
  { kind: "expense", label: "Expense", hint: "A bill you need to pay" },
  { kind: "receipt", label: "Payment received", hint: "Money that reached your account" },
];

/** Type a record in without leaving Add records. Each tab uses the same save forms as the Invoices and Expenses pages. */
export function ManualEntry({ workspace, initial = "invoice" }: { workspace: WorkspaceSnapshot; initial?: EntryKind }) {
  const [kind, setKind] = useState<EntryKind>(initial);
  const id = useId();
  const unpaid = workspace.invoices.filter((invoice) => invoice.outstanding_cents > 0);
  const [invoiceId, setInvoiceId] = useState("");
  const chosen = unpaid.find((invoice) => invoice.id === invoiceId);
  const customerName = (customerId: string) => workspace.customers.find((customer) => customer.id === customerId)?.name ?? "";

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = TABS[(TABS.findIndex((tab) => tab.kind === kind) + step + TABS.length) % TABS.length];
    setKind(next.kind);
    document.getElementById(`${id}-${next.kind}`)?.focus();
  };

  return (
    <section className="add-entry" aria-label="Type a record in">
      <div className="add-entry-tabs" role="tablist" aria-label="What are you adding?">
        {TABS.map((tab) => (
          <button key={tab.kind} id={`${id}-${tab.kind}`} type="button" role="tab" aria-selected={kind === tab.kind}
            aria-controls={`${id}-panel`} tabIndex={kind === tab.kind ? 0 : -1} onClick={() => setKind(tab.kind)} onKeyDown={move}>
            <strong>{tab.label}</strong><small>{tab.hint}</small>
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${kind}`} className="add-entry-panel">
        {/* New customers are added from the invoice form's Customer dropdown. */}
        {kind === "invoice" && <InvoiceForm workspace={workspace} />}
        {kind === "expense" && <ExpenseForm workspace={workspace} />}
        {kind === "receipt" && (unpaid.length
          ? <>
            <label className="form-field add-entry-pick">
              <span>Which invoice was paid?</span>
              <select className="field" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}>
                <option value="">Choose an unpaid invoice</option>
                {unpaid.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} · {customerName(invoice.customer_id)} · {formatPHP(invoice.outstanding_cents)} unpaid</option>)}
              </select>
            </label>
            {chosen && <PaymentForm key={chosen.id} workspace={workspace} kind="receipt" parentId={chosen.id} remainingCents={chosen.outstanding_cents} />}
          </>
          : <p className="add-entry-note">No unpaid invoices yet. Add an invoice first, then record its payment here.</p>)}
      </div>
    </section>
  );
}
