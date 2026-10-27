"use client";
import { useState, type FormEvent } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { compareScenario as previewExpectation } from "@/lib/domain/forecast";
import { formatPHP, parseMoney } from "@/lib/domain/money";
import { assertLocalDate } from "@/lib/domain/dates";
import { CommandForm, Field, TextAreaField, AssigneeField } from "./command-form";
import { CashImpact } from "./cash-impact";

type Props = { workspace: WorkspaceSnapshot; invoice: WorkspaceSnapshot["invoices"][number] };
function ExpectationFields({ workspace, invoice }: Props) {
  const current = workspace.expectations.find((row) => row.invoice_id === invoice.id);
  const next = workspace.followups
    .filter(
      (row) => row.invoice_id === invoice.id && row.state === "open" && row.automatic_type === null,
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const [proposal, setProposal] = useState<{ date: string; amountCents: number } | null>(null);
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
        Confirm one remaining receipt amount/date. Keep installment messages intact and choose one
        receipt; the unplanned remainder stays outside the forecast.
      </p>
      <div className="form-grid">
        <Field
          label="Expected remaining receipt (PHP)"
          name="amount"
          inputMode="decimal"
          defaultValue={
            current && current.remaining_cents > 0 ? (current.remaining_cents / 100).toFixed(2) : ""
          }
          required
        />
        <Field
          label="Expected receipt date"
          name="date"
          type="date"
          defaultValue={
            current &&
            current.state === "active" &&
            current.expected_date >= workspace.forecastInput.referenceDate
              ? current.expected_date
              : ""
          }
          required
        />
      </div>
      <label className="form-field">
        <span>Basis for this expectation</span>
        <select name="kind" className="field" defaultValue="" required>
          <option value="" disabled>
            Choose the basis
          </option>
          <option value="commitment">Customer-confirmed promise</option>
          <option value="assumption">Business planning assumption</option>
        </select>
      </label>
      <TextAreaField
        label="Customer message or planning source"
        name="sourceNote"
        maxLength={4000}
        defaultValue={current?.source_note ?? ""}
        required
      />
      <p className="muted">
        A past receipt date is retained for review and excluded from future inflows. A statement
        saying “paid” still needs actual payment verification.
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
        The current open manual follow-up is updated, or one is created if needed.
      </p>
      {comparison ? (
        <CashImpact {...comparison} />
      ) : (
        <p className="muted">
          {previewError || "Enter a valid amount and date to preview their cash impact."}
        </p>
      )}
      <label className="check-field">
        <input type="checkbox" required />
        <span>
          I reviewed the amount, date, source and cash impact. This is an expectation, not money
          received.
        </span>
      </label>
    </div>
  );
}

export function CollectionPanel({ workspace, invoice }: Props) {
  const current = workspace.expectations.find((row) => row.invoice_id === invoice.id);
  const review =
    current &&
    (current.state === "needs_review" ||
      current.expected_date < workspace.forecastInput.referenceDate);
  const planned = current && !review ? current.remaining_cents : 0;
  return (
    <section id="collection-plan" className="panel">
      <h2>Current receipt expectation</h2>
      {current ? (
        <>
          <p className="expectation-amount num">{formatPHP(current.remaining_cents)}</p>
          <p>
            {current.expected_date} ·{" "}
            {current.kind === "commitment" ? "Customer-confirmed promise" : "Planning assumption"}
          </p>
          <p className={review ? "negative" : "muted"}>
            {review
              ? "Needs review · Excluded from projected inflows"
              : "Included only within the forecast date window"}
          </p>
          <blockquote>{current.source_note}</blockquote>
          <p className="muted">
            Confirmed{" "}
            {new Date(current.confirmed_at).toLocaleString("en-PH", {
              timeZone: "Asia/Manila",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </>
      ) : (
        <p className="empty-state">No current expectation.</p>
      )}
      <p className="muted">
        Unplanned outstanding amount:{" "}
        <span className="num">{formatPHP(Math.max(0, invoice.outstanding_cents - planned))}</span>.
      </p>
      {invoice.outstanding_cents > 0 && (
        <details className="disclosure">
          <summary>Review or confirm a receipt plan</summary>
          <CommandForm
            revision={workspace.revision}
            label="Confirm reviewed receipt plan"
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
            <ExpectationFields workspace={workspace} invoice={invoice} />
          </CommandForm>
        </details>
      )}
    </section>
  );
}
