"use client";
import { useId, useState, type FormEvent } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { compareScenario as previewExpectation, FORECAST_DAYS } from "@/lib/domain/forecast";
import { formatPHP, parseMoney } from "@/lib/domain/money";
import { addDays, assertLocalDate } from "@/lib/domain/dates";
import { formatPlanDate } from "@/lib/display";
import { CommandForm, Field, TextAreaField, AssigneeField } from "./command-form";
import { CashImpact } from "./cash-impact";
import { AppIcon } from "./app-icon";

type Props = { workspace: WorkspaceSnapshot; invoice: WorkspaceSnapshot["invoices"][number]; proposed?: { amountCents: number; date: string; sourceNote: string }; openPlan?: boolean };
function ExpectationFields({ workspace, invoice, proposed }: Props) {
  const current = workspace.expectations.find((row) => row.invoice_id === invoice.id);
  const next = workspace.followups
    .filter(
      (row) => row.invoice_id === invoice.id && row.state === "open" && row.automatic_type === null,
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const [proposal, setProposal] = useState<{ date: string; amountCents: number } | null>(proposed ?? null);
  function updatePreview(event: FormEvent<HTMLDivElement>) {
    const form = event.currentTarget.closest("form");
    if (!form) return;
    const data = new FormData(form);
    try {
      setProposal({
        date: assertLocalDate(String(data.get("date"))),
        amountCents: parseMoney(String(data.get("amount"))),
      });
    } catch {
      setProposal(null);
    }
  }
  let comparison: ReturnType<typeof previewExpectation> | null = null;
  let previewError = "";
  if (proposal) {
    try {
      comparison = previewExpectation(workspace.forecastInput, {
        invoiceId: invoice.id,
        ...proposal,
      });
    } catch (error) {
      previewError =
        error instanceof RangeError ? error.message : "Review the proposed amount and date.";
    }
  }
  return (
    <div className="expectation-fields" onInput={updatePreview}>
      <p className="muted">
        Keep the full customer message. Choose one amount and date for the forecast.
      </p>
      <div className="form-grid">
        <Field
          label="Expected amount (PHP)"
          name="amount"
          inputMode="decimal"
          defaultValue={
            proposed ? (proposed.amountCents / 100).toFixed(2) : current && current.remaining_cents > 0 ? (current.remaining_cents / 100).toFixed(2) : ""
          }
          required
        />
        <Field
          label="Expected payment date"
          name="date"
          type="date"
          defaultValue={
            proposed?.date ?? (current &&
            current.state === "active" &&
            current.expected_date >= workspace.forecastInput.referenceDate
              ? current.expected_date
              : "")
          }
          required
        />
      </div>
      <label className="form-field">
        <span>Source of this plan</span>
        <select name="kind" className="field" defaultValue="" required>
          <option value="" disabled>
            Choose a source
          </option>
          <option value="commitment">Customer-confirmed promise</option>
          <option value="assumption">Business planning assumption</option>
        </select>
      </label>
      <TextAreaField
        label="Customer message or planning note"
        name="sourceNote"
        maxLength={4000}
        defaultValue={proposed?.sourceNote ?? current?.source_note ?? ""}
        required
      />
      <p className="muted">
        Past dates stay in history for review and are left out of the forecast.
      </p>
      <div className="form-grid">
        <Field
          label="Next follow-up date"
          name="nextFollowupDate"
          type="date"
          min={workspace.forecastInput.referenceDate}
          defaultValue={
            next && next.due_date >= workspace.forecastInput.referenceDate
              ? next.due_date
              : workspace.forecastInput.referenceDate
          }
          required
        />
        <AssigneeField
          members={workspace.members}
          defaultValue={next?.assignee_id ?? workspace.actor.userId}
        />
      </div>
      <p className="muted">
        This saves the next follow-up for the assigned person.
      </p>
      {comparison ? (
        <CashImpact {...comparison} />
      ) : (
        <p className="muted">
          {previewError || "Enter an amount and date to preview the cash impact."}
        </p>
      )}
      <label className="check-field">
        <input type="checkbox" required />
        <span>
          I reviewed the amount, date, source and cash impact for this plan.
        </span>
      </label>
    </div>
  );
}

export function CollectionPanel({ workspace, invoice, proposed, openPlan = false }: Props) {
  const headingId = useId();
  const current = workspace.expectations.find((row) => row.invoice_id === invoice.id);
  const review =
    current &&
    (current.state === "needs_review" ||
      current.expected_date < workspace.forecastInput.referenceDate);
  const forecastEnd = addDays(workspace.forecastInput.referenceDate, FORECAST_DAYS - 1);
  const outsideForecast = current && current.expected_date > forecastEnd;
  const planned = current && !review ? current.remaining_cents : 0;
  const unplanned = Math.max(0, invoice.outstanding_cents - planned);
  const unpaid = invoice.outstanding_cents > 0;
  return (
    <section id={proposed ? undefined : "collection-plan"} className="panel collection-plan" aria-labelledby={headingId}>
      <h2 id={headingId}>Expected payment</h2>
      {unpaid && <p className="muted">For the forecast. Record payment when the money arrives.</p>}
      {proposed && <p className="muted">Original due {formatPlanDate(invoice.due_date)} · Received {formatPHP(invoice.paid_cents)}</p>}
      {current ? (
        <>
          <div className="invoice-expected-summary">
            <strong className="expectation-amount num">{formatPHP(current.remaining_cents)}</strong>
            <span className="muted">
              <time dateTime={current.expected_date}>{formatPlanDate(current.expected_date)}</time> ·{" "}
              {current.kind === "commitment" ? "Customer promise" : "Planning estimate"}
            </span>
            {review ? <p className="negative">Needs review · Excluded from the forecast</p>
              : outsideForecast && <p className="muted">Outside the 30-day forecast</p>}
          </div>
          <details className="disclosure" open={!!proposed}>
            <summary>Source and confirmation</summary>
            <blockquote>{current.source_note}</blockquote>
            <p className="muted">
              Confirmed{" "}
              {new Date(current.confirmed_at).toLocaleString("en-PH", {
                timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
              })}
            </p>
          </details>
        </>
      ) : (
        <p className="empty-state">{unpaid ? "No payment date set." : "Paid in full."}</p>
      )}
      {unplanned > 0 && <p className="muted invoice-unplanned"><strong className="num">{formatPHP(unplanned)}</strong> needs a payment date.</p>}
      {unpaid && (
        <details className="disclosure" open={!!proposed || openPlan}>
          <summary className="row-action">{current ? "Update expected payment" : "Set expected payment"} <AppIcon name="chevron-down" /></summary>
          <CommandForm
            revision={workspace.revision}
            label={proposed ? "Confirm reviewed receipt plan" : "Save payment plan"}
            build={(data) => ({
              type: "confirm_expectation",
              payload: {
                invoiceId: invoice.id,
                amountCents: parseMoney(String(data.get("amount"))),
                date: String(data.get("date")),
                kind: String(data.get("kind")),
                sourceNote: String(data.get("sourceNote")),
                nextFollowupDate: String(data.get("nextFollowupDate")),
                assigneeId: String(data.get("assigneeId")),
              },
            })}
          >
            <ExpectationFields workspace={workspace} invoice={invoice} proposed={proposed} />
          </CommandForm>
        </details>
      )}
    </section>
  );
}
