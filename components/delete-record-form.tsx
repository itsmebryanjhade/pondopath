"use client";

import { useRouter } from "next/navigation";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { CommandForm, Field } from "./command-form";

/**
 * Delete an invoice or bill that was entered by mistake. Records with any payment history
 * stay (those payments are financial history); the person is pointed to editing instead.
 * The deleted record and what went with it stay in the audit log with the reason.
 */
export function DeleteRecordForm({ workspace, kind, id, name, hasPayments, redirectTo }: {
  workspace: WorkspaceSnapshot;
  kind: "invoice" | "expense";
  id: string;
  name: string;
  hasPayments: boolean;
  /** Where to go once the record is gone, e.g. the invoice list when deleting from its own page. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const noun = kind === "invoice" ? "invoice" : "bill";

  if (hasPayments) {
    return (
      <p className="invoice-edit-note">
        This {noun} has payment history, so it can&rsquo;t be deleted. You can still edit it
        {workspace.actor.role === "owner" ? ", or delete a wrong payment first." : "; ask the owner to correct a wrong payment."}
      </p>
    );
  }

  return (
    <CommandForm
      revision={workspace.revision}
      label={`Delete ${noun}`}
      onSaved={redirectTo ? () => router.push(redirectTo) : undefined}
      build={(data) => ({
        type: kind === "invoice" ? "delete_invoice" : "delete_expense",
        payload: { id, reason: String(data.get("reason") ?? "") },
      })}
    >
      <p className="muted">
        This removes <strong>{name}</strong>
        {kind === "invoice" ? ", its expected payment and its follow-ups" : ""} from your cash plan.
        A copy is kept in the audit history. To bring it back, add it again.
      </p>
      <Field label="Reason" name="reason" defaultValue={`${noun[0].toUpperCase()}${noun.slice(1)} entered by mistake`} maxLength={4000} required />
      <label className="check-field">
        <input type="checkbox" required />
        <span>Yes, delete this {noun}.</span>
      </label>
    </CommandForm>
  );
}
