"use client";

import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPHP, parseMoney } from "@/lib/domain/money";
import { CommandForm, Field } from "./command-form";

export function PaymentForm({
  workspace,
  kind,
  parentId,
  remainingCents,
}: {
  workspace: WorkspaceSnapshot;
  kind: "receipt" | "expense_payment";
  parentId: string;
  remainingCents: number;
}) {
  if (remainingCents === 0)
    return <p className="muted">Fully paid. No additional payment can be allocated.</p>;
  return (
    <CommandForm
      revision={workspace.revision}
      label={kind === "receipt" ? "Record verified receipt" : "Record verified expense payment"}
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
      <p>
        Remaining to allocate: <strong className="num">{formatPHP(remainingCents)}</strong>
      </p>
      <div className="form-grid">
        <Field
          label="Verified payment amount (PHP)"
          name="amount"
          inputMode="decimal"
          required
          help="A customer promise or message saying “paid” is not proof of receipt."
        />
        <Field
          label="Actual payment date"
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
          I checked that this money movement actually occurred through the business’s normal
          process.
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

export function VoidForm({ revision, movementId }: { revision: number; movementId: string }) {
  return (
    <CommandForm
      revision={revision}
      label="Void this incorrect entry"
      build={(data) => ({
        type: "void_cash_movement",
        payload: { movementId, reason: String(data.get("reason") ?? "") },
      })}
    >
      <p className="muted">
        The original entry stays in history. Cash and unpaid totals are recomputed. Voiding a
        customer receipt also marks its expectation for review.
      </p>
      <Field label="Reason for voiding this entry" name="reason" maxLength={4000} required />
      <label className="check-field">
        <input type="checkbox" required />
        <span>I reviewed this entry and confirm it is incorrect.</span>
      </label>
    </CommandForm>
  );
}
