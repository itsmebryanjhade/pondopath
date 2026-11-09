"use client";

import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPHP, parseMoney } from "@/lib/domain/money";
import { CommandForm, Field } from "./command-form";

export function PaymentForm({
  workspace,
  kind,
  parentId,
  remainingCents,
  showRemaining = true,
}: {
  workspace: WorkspaceSnapshot;
  kind: "receipt" | "expense_payment";
  parentId: string;
  remainingCents: number;
  /** Hide the "Still owed" line when the page already shows that amount right above the form. */
  showRemaining?: boolean;
}) {
  if (remainingCents === 0)
    return <p className="muted">Fully paid. No additional payment can be allocated.</p>;
  const receipt = kind === "receipt";
  return (
    <CommandForm
      revision={workspace.revision}
      label={receipt ? "Save payment received" : "Record verified expense payment"}
      build={(data) => ({
        type: "post_cash_movement",
        payload: {
          kind,
          parentId,
          amountCents: parseMoney(String(data.get("amount"))),
          date: String(data.get("date")),
          reference: String(data.get("reference") ?? ""),
          ...(data.get("duplicateReviewed")
            ? {
                duplicateReviewed: true,
                duplicateReviewReason: String(data.get("duplicateReviewReason") ?? ""),
              }
            : {}),
        },
      })}
    >
      {showRemaining && <p>
        {receipt ? "Still owed" : "Remaining to allocate"}: <strong className="num">{formatPHP(remainingCents)}</strong>
      </p>}
      <div className="form-grid">
        <Field
          label={receipt ? "Amount received (PHP)" : "Verified payment amount (PHP)"}
          name="amount"
          inputMode="decimal"
          required
          help={receipt ? "Check your bank or other proof of receipt." : "A customer promise or message saying “paid” is not proof of receipt."}
        />
        <Field
          label={receipt ? "Date received" : "Actual payment date"}
          name="date"
          type="date"
          min={workspace.business.opening_date}
          max={workspace.forecastInput.referenceDate}
          defaultValue={workspace.forecastInput.referenceDate}
          required
        />
        <Field
          label="Payment reference (optional)"
          name="reference"
          maxLength={100}
          help="A nonempty reference remains reserved even if the entry is later voided."
        />
      </div>
      <label className="check-field">
        <input type="checkbox" name="verified" required />
        <span>
          {receipt
            ? "I verified that the money was received."
            : "I checked that this money movement actually occurred through the business’s normal process."}
        </span>
      </label>
      <details className="duplicate-review">
        <summary>Review a possible duplicate</summary>
        <p className="muted">
          Use only after verifying that two entries for this record, date and amount represent
          separate real payments.
        </p>
        <label className="check-field">
          <input type="checkbox" name="duplicateReviewed" />
          <span>I verified a separate payment.</span>
        </label>
        <Field label="Duplicate review reason" name="duplicateReviewReason" maxLength={4000} />
      </details>
    </CommandForm>
  );
}

export function VoidForm({
  revision,
  movementId,
  kind,
}: {
  revision: number;
  movementId: string;
  kind?: "receipt" | "expense_payment";
}) {
  const billPayment = kind === "expense_payment";
  return (
    <CommandForm
      revision={revision}
      label="Delete payment"
      build={(data) => ({
        type: "void_cash_movement",
        payload: { movementId, reason: String(data.get("reason") ?? "") },
      })}
    >
      <p className="muted">
        {billPayment
          ? "The payment stays in history, crossed out. PondoPath adds the amount back to available cash and the bill’s unpaid balance. To fix an amount or date, delete the payment and record it again."
          : "The payment stays in history, crossed out. PondoPath subtracts the amount from available cash and adds it back to the unpaid balance. Any expected payment goes back for review. To fix an amount or date, delete the payment and record it again."}
      </p>
      <Field
        label="Reason for deleting"
        name="reason"
        maxLength={4000}
        required
      />
      <label className="check-field">
        <input type="checkbox" required />
        <span>I confirm this payment was recorded by mistake.</span>
      </label>
    </CommandForm>
  );
}
