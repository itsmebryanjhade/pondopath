"use client";
import { useId, useState, type FormEvent } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { compareScenario as previewExpectation, FORECAST_DAYS } from "@/lib/domain/forecast";
import { formatPHP, parseMoney } from "@/lib/domain/money";
import { addDays, assertLocalDate } from "@/lib/domain/dates";
import { formatPlanDate } from "@/lib/display";
import { CommandForm, Field, TextAreaField, AssigneeField } from "./command-form";
import { CashImpact } from "./cash-impact";
import { InlineActions } from "./inline-actions";
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
      <h3 className="form-section-title">Payment</h3>
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
      <fieldset className="choice-field">
        <legend>How sure are you?</legend>
        <div className="choice-row">
          <label className="choice"><input type="radio" name="kind" value="commitment" required /><span>Customer promised</span></label>
          <label className="choice"><input type="radio" name="kind" value="assumption" required /><span>My estimate</span></label>
        </div>
      </fieldset>
      <TextAreaField
        label="Note: what they said, or why this date"
        name="sourceNote"
        maxLength={4000}
        rows={2}
        defaultValue={proposed?.sourceNote ?? current?.source_note ?? ""}
        required
      />
      <h3 className="form-section-title">Next follow-up</h3>
      <div className="form-grid">
        <Field
          label="Follow-up date"
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
      {comparison ? (
        <CashImpact {...comparison} />
      ) : (
        <p className="impact-empty">
          {previewError || "Enter an amount and date to see the cash impact."}
        </p>
      )}
      <label className="check-field">
        <input type="checkbox" required />
        <span>
          I checked the amount, date and cash impact.
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
      {(() => {
        // One plain sentence for where this invoice's money stands in the forecast, then the details.
        if (!unpaid) return <p className="expected-status is-done">Paid in full.</p>;
        if (!current) return <p className="expected-status is-warn">No payment date yet, so this money isn&rsquo;t in the forecast.</p>;
        const date = formatPlanDate(current.expected_date, true);
        const sentence = review
          ? `${current.kind === "commitment" ? "The customer promised to pay on" : "You expected payment on"} ${date}. That date has passed, so it isn’t in the forecast.`
          : outsideForecast
            ? `Expected ${date}. Outside the 30-day forecast, so it isn’t counted yet.`
            : `${current.kind === "commitment" ? "The customer promised to pay" : "Expected"} ${formatPHP(current.remaining_cents)} on ${date}. It’s in the forecast.`;
        return <>
          <p className={`expected-status ${review ? "is-warn" : outsideForecast ? "is-later" : "is-ok"}`}>{sentence}</p>
          {unplanned > 0 && !review && <p className="expected-status is-warn"><strong className="num">{formatPHP(unplanned)}</strong> still needs a payment date.</p>}
          <details className="disclosure expected-source" open={!!proposed}>
            <summary>Where this date came from <AppIcon name="chevron-down" /></summary>
            <p className="muted">{formatPHP(current.remaining_cents)} · {current.kind === "commitment" ? "Customer promise" : "Planning estimate"} · confirmed{" "}
              {new Date(current.confirmed_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</p>
            <blockquote>{current.source_note}</blockquote>
          </details>
        </>;
      })()}
      {unpaid && (
        <InlineActions
          defaultActive={proposed || openPlan ? "plan" : null}
          actions={[{
            key: "plan",
            label: review ? "Set a new date" : current ? "Update expected payment" : "Set expected payment",
            tone: review || !current ? "main" : "quiet",
            content: (
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
            ),
          }]}
        />
      )}
    </section>
  );
}
