"use client";

import { useState, useTransition } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { getApprovedReminderText } from "@/app/(workspace)/actions";
import { formatPHP } from "@/lib/domain/money";
import { CommandForm, Field, TextAreaField } from "./command-form";

type Props = {
  workspace: WorkspaceSnapshot;
  invoice: WorkspaceSnapshot["invoices"][number];
  customer: WorkspaceSnapshot["customers"][number];
  template: string;
};

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ReminderPanel({ workspace, invoice, customer, template }: Props) {
  const reminder = [...workspace.reminders]
    .filter((row) => row.invoice_id === invoice.id && row.state !== "reported_sent")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))[0] ?? null;
  const reported = [...workspace.reminders]
    .filter((row) => row.invoice_id === invoice.id && row.state === "reported_sent")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))[0] ?? null;
  const [copyText, setCopyText] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copyPending, startCopy] = useTransition();
  const approvalDigest = (reminder?.approval_basis as { digest?: string } | null)?.digest;
  const initialRecipient = customer.email || customer.phone || customer.contact_name;

  function copyApprovedText() {
    if (!reminder) return;
    setCopyNotice("");
    setCopyError("");
    startCopy(async () => {
      const result = await getApprovedReminderText(reminder.id);
      if (!result.ok) {
        setCopyError(result.message);
        setCopyText("");
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.text);
        setCopyNotice("Approved text copied. This does not send the message.");
        setCopyText("");
      } catch {
        setCopyText(result.data.text);
        setCopyNotice("Your browser blocked clipboard access. Select the approved text below and copy it manually; this does not send the message.");
      }
    });
  }

  return (
    <section className="panel reminder-panel" aria-labelledby="reminder-heading">
      <h2 id="reminder-heading">Payment reminder</h2>
      <p className="muted">
        Current outstanding balance: <strong className="num">{formatPHP(invoice.outstanding_cents)}</strong>.
        A saved message does not change when invoice records change, so check its amount and recipient before resubmitting. Saving or copying never sends a message.
      </p>
      {reminder && (
        <div className="reminder-status">
          <p><strong>Status:</strong> {reminder.state === "rejected" ? "Changes requested" : reminder.state.replaceAll("_", " ")}</p>
          {reminder.rejection_reason && <p><strong>Owner feedback:</strong> {reminder.rejection_reason}</p>}
          {reminder.state === "awaiting_review" && <p className="muted">The owner reviews this exact draft before it can be copied.</p>}
          {reminder.state === "approved" && reminder.approved_version === null && (
            <p className="negative">This reminder predates versioned approval. Save it as a draft, then submit it for a fresh review before copying.</p>
          )}
          <details className="reminder-preview">
            <summary>Review exact saved message</summary>
            <p><strong>Recipient:</strong> {reminder.recipient}</p>
            <blockquote>{reminder.body}</blockquote>
          </details>
          {reminder.state === "approved" && reminder.approved_version !== null && (
            <>
              <p className="muted">Approved by the owner. Copying is not delivery.</p>
              {reminder.approved_recipient && <p>Approved recipient: {reminder.approved_recipient}</p>}
              <button className="button secondary" type="button" onClick={copyApprovedText} disabled={copyPending}>
                {copyPending ? "Checking approval…" : "Copy approved text"}
              </button>
              {copyNotice && <p role="status" className="form-feedback">{copyNotice}</p>}
              {copyError && <p role="alert" className="form-feedback error-feedback">{copyError}</p>}
              {copyText && <label className="form-field reminder-copy-fallback"><span>Approved text to copy manually</span><textarea className="field" readOnly rows={5} value={copyText} onFocus={(event) => event.currentTarget.select()} /></label>}
              <p className="muted">After sending it through your usual channel, you may record that action. The report is unverified.</p>
              <CommandForm
                key={`report-${reminder.id}-${reminder.version}`}
                revision={workspace.revision}
                label="Report sent manually"
                build={(data) => ({
                  type: "report_manual_send",
                  payload: {
                    id: reminder.id,
                    reminderVersion: reminder.version,
                    channel: String(data.get("channel")),
                    sentAt: new Date(String(data.get("sentAt"))).toISOString(),
                  },
                })}
              >
                <div className="form-grid">
                  <Field label="Channel used" name="channel" maxLength={200} placeholder="Email, phone, or messaging app" required />
                  <Field label="Time you sent it" name="sentAt" type="datetime-local" defaultValue={localDateTimeValue()} required />
                </div>
                <p className="muted">This records what you report; the system cannot verify delivery or acknowledgement.</p>
              </CommandForm>
            </>
          )}
        </div>
      )}

      {reminder && reminder.state === "awaiting_review" && (
        <div className="reminder-actions">
          <CommandForm
            key={`renew-${reminder.id}-${reminder.version}`}
            revision={workspace.revision}
            label="Resubmit for owner review"
            build={() => ({ type: "submit_reminder", payload: { id: reminder.id, reminderVersion: reminder.version } })}
          >
            <p className="muted">Refreshes the approval basis and asks the owner to review this version.</p>
          </CommandForm>
          {workspace.actor.role === "owner" && approvalDigest && (
            <>
              <CommandForm
                key={`approve-${reminder.id}-${reminder.version}`}
                revision={workspace.revision}
                label="Approve this version"
                build={() => ({ type: "approve_reminder", payload: { id: reminder.id, reminderVersion: reminder.version, approvalBasis: approvalDigest } })}
              >
                <p className="muted">This approves the exact draft shown above, for its current recipient and invoice balance.</p>
              </CommandForm>
              <CommandForm
                key={`reject-${reminder.id}-${reminder.version}`}
                revision={workspace.revision}
                label="Request changes"
                build={(data) => ({ type: "reject_reminder", payload: { id: reminder.id, reminderVersion: reminder.version, approvalBasis: approvalDigest, reason: String(data.get("reason")) } })}
              >
                <Field label="Reason for requested changes" name="reason" maxLength={4000} required />
              </CommandForm>
            </>
          )}
        </div>
      )}

      {invoice.outstanding_cents > 0 && (
        <details className="disclosure" open={!reminder}>
          <summary>{reminder ? "Edit reminder draft" : "Prepare a reminder draft"}</summary>
          <CommandForm
            key={`save-${reminder?.id ?? "new"}-${reminder?.version ?? 0}`}
            revision={workspace.revision}
            label="Save draft"
            build={(data) => ({
              type: "save_reminder",
              payload: {
                ...(reminder ? { id: reminder.id } : {}),
                invoiceId: invoice.id,
                recipient: String(data.get("recipient")),
                body: String(data.get("body")),
              },
            })}
          >
            <p className="muted">The template starts with the outstanding balance, never the original invoice total.</p>
            <Field label="Recipient snapshot" name="recipient" defaultValue={reminder?.recipient ?? initialRecipient} maxLength={200} required />
            <TextAreaField label="Reminder message" name="body" defaultValue={reminder?.body ?? template} maxLength={2000} required />
          </CommandForm>
        </details>
      )}

      {reminder && (reminder.state === "draft" || reminder.state === "rejected") && (
        <CommandForm
          key={`submit-${reminder.id}-${reminder.version}`}
          revision={workspace.revision}
          label="Submit for owner review"
          build={() => ({ type: "submit_reminder", payload: { id: reminder.id, reminderVersion: reminder.version } })}
        >
          <p className="muted">The message stays a draft until the owner reviews this version.</p>
        </CommandForm>
      )}

      {reported && (
        <p className="form-feedback">
          Latest report: sent by {workspace.members.find((member) => member.user_id === reported.reported_by)?.display_name ?? "a workspace member"} via {reported.reported_channel ?? "an unrecorded channel"}.
          {reported.reported_sent_at && ` Time entered: ${new Date(reported.reported_sent_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}.`}
          {" "}Delivery is unverified.
        </p>
      )}
      {invoice.outstanding_cents <= 0 && <p className="empty-state">No reminder can be prepared because the invoice is fully paid.</p>}
    </section>
  );
}
