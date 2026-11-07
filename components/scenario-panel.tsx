"use client";
import { useState } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { compareScenario as previewExpectation } from "@/lib/domain/forecast";
import { formatPHP, parseMoney } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { CashImpact } from "./cash-impact";
import { AppIcon } from "./app-icon";

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const decimal = (cents: number) => (cents / 100).toFixed(2);

/**
 * "What if a customer pays later or only part?" — an unsaved preview that updates as you change it.
 * `inline` shows it open (the Forecast page); otherwise it is a closed disclosure (an invoice's page).
 */
export function ScenarioPanel({
  workspace,
  invoiceId,
  inline = false,
}: {
  workspace: WorkspaceSnapshot;
  invoiceId?: string;
  inline?: boolean;
}) {
  const invoices = workspace.invoices.filter(
    (row) => row.outstanding_cents > 0 && (!invoiceId || row.id === invoiceId),
  );
  const today = workspace.forecastInput.referenceDate;
  // Start from the date the plan currently expects (never in the past) and the full unpaid amount.
  const startFor = (id: string) => {
    const invoice = invoices.find((row) => row.id === id) ?? invoices[0];
    const planned = workspace.forecastInput.invoices.find((row) => row.id === invoice.id)?.expectation?.date ?? invoice.due_date;
    return { id: invoice.id, date: planned < today ? today : planned, amount: decimal(invoice.outstanding_cents), planned };
  };
  const [state, setState] = useState(() => (invoices.length ? startFor(invoiceId ?? invoices[0].id) : null));
  if (!invoices.length || !state) return null;

  const invoice = invoices.find((row) => row.id === state.id) ?? invoices[0];
  const start = startFor(invoice.id);
  const customer = workspace.customers.find((row) => row.id === invoice.customer_id)?.name ?? "Customer unavailable";
  let preview: ReturnType<typeof previewExpectation> | null = null;
  let error = "";
  try {
    preview = previewExpectation(workspace.forecastInput, { invoiceId: invoice.id, date: state.date, amountCents: parseMoney(state.amount, { allowZero: true }) });
  } catch (failure) {
    error = failure instanceof RangeError ? "Use an amount from 0 up to the unpaid balance, and a date from today." : "Check the date and amount.";
  }
  const set = (patch: Partial<typeof state>) => setState({ ...state, ...patch });

  const body = <div className="scenario-body">
    <form className="scenario-form" onSubmit={(event) => event.preventDefault()}>
      <label className="form-field scenario-invoice">
        <span>Invoice</span>
        <select className="field" value={invoice.id} onChange={(event) => setState(startFor(event.target.value))}>
          {invoices.map((row) => (
            <option key={row.id} value={row.id}>{row.number} · {workspace.customers.find((item) => item.id === row.customer_id)?.name ?? ""}</option>
          ))}
        </select>
        <small>{formatPHP(invoice.outstanding_cents)} unpaid · {customer} · {start.planned < today
          ? `was expected ${formatPlanDate(start.planned, true)}, so it isn't in the forecast now`
          : `expected ${formatPlanDate(start.planned, true)}`}</small>
      </label>
      <div className="scenario-fields">
        <label className="form-field">
          <span>Payment date</span>
          <input className="field" type="date" min={today} value={state.date} onChange={(event) => set({ date: event.target.value })} />
        </label>
        <label className="form-field">
          <span>Amount (PHP)</span>
          <input className="field" inputMode="decimal" value={state.amount} onChange={(event) => set({ amount: event.target.value })} />
        </label>
      </div>
      <div className="scenario-chips" role="group" aria-label="Quick tries">
        <span>Quick tries</span>
        <button type="button" onClick={() => set({ date: addDays(start.date, 7) })}>1 week later</button>
        <button type="button" onClick={() => set({ date: addDays(start.date, 14) })}>2 weeks later</button>
        <button type="button" onClick={() => set({ amount: decimal(Math.round(invoice.outstanding_cents / 2)) })}>Pays half</button>
        <button type="button" onClick={() => set({ amount: "0" })}>Doesn&rsquo;t pay</button>
        <button type="button" className="scenario-reset" onClick={() => setState(start)}>Reset</button>
      </div>
    </form>
    {error ? <p className="form-feedback error-feedback" role="alert">{error}</p> : preview && <CashImpact {...preview} />}
  </div>;

  if (inline) return <div className="scenario-panel scenario-inline">{body}</div>;
  return (
    <details className="panel disclosure scenario-panel">
      <summary><AppIcon name="help-circle" /><span>What if a customer pays later or only part?</span><AppIcon name="chevron-down" /></summary>
      <p className="muted">Try a payment date or amount. Nothing is saved.</p>
      {body}
    </details>
  );
}
