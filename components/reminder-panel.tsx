"use client";

import { useState, useTransition } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { getApprovedReminderText } from "@/app/(workspace)/actions";
import { formatPHP } from "@/lib/domain/money";
import { CommandForm, Field, TextAreaField } from "./command-form";
import { AppIcon } from "./app-icon";
import { InlineActions, type InlineAction } from "./inline-actions";

type Props = {
  workspace: WorkspaceSnapshot;
  invoice: WorkspaceSnapshot["invoices"][number];
  customer: WorkspaceSnapshot["customers"][number];
  template: string;
  suggestedBody?: string;
  collapsible?: boolean;
};

function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Reminder status in plain words, for the collapsed row. */
const REMINDER_STATE: Record<string, string> = { draft: "Draft", awaiting_review: "Waiting for approval", approved: "Ready to copy", rejected: "Changes requested" };
const STEPS = ["Write", "Owner approves", "Copy and send", "Mark as sent"];

export function ReminderPanel({ workspace, invoice, customer, template, suggestedBody, collapsible = false }: Props) {
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

  const unpaid = invoice.outstanding_cents > 0;
  const isOwner = workspace.actor.role === "owner";
  const state = reminder?.state;
  const legacyApproval = state === "approved" && reminder?.approved_version === null;
  // Where this reminder is in the four steps (0-based); 4 means the last one was reported sent.
  const step = !reminder ? (reported ? 4 : 0) : state === "awaiting_review" ? 1 : state === "approved" && !legacyApproval ? 2 : 0;
  const reportedBy = reported && (workspace.members.find((member) => member.user_id === reported.reported_by)?.display_name ?? "a teammate");
  const reportedAt = reported?.reported_sent_at && new Date(reported.reported_sent_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

  // One plain sentence: what is happening now and what to do next.
  const next = !unpaid ? "This invoice is fully paid, so no reminder is needed."
    : !reminder ? (reported ? `Sent by ${reportedBy} via ${reported.reported_channel ?? "an unrecorded channel"}${reportedAt ? ` on ${reportedAt}` : ""}. Delivery isn\u2019t confirmed.` : "Write the message below. It starts with the balance still owed.")
    : legacyApproval ? "This approval is from an older version. Edit and save the message, then ask the owner to approve it again."
    : state === "draft" ? "Draft saved. Ask the owner to approve it before you send it."
    : state === "rejected" ? "The owner asked for changes. Edit the message, then ask again."
    : state === "awaiting_review" ? (isOwner ? "Read the message, then approve it or ask for changes." : "Waiting for the owner to approve this message.")
    : "Approved. Copy the message, send it yourself (email, text or chat), then mark it as sent.";

  const draftForm = (
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
      <Field label="To" name="recipient" defaultValue={reminder?.recipient ?? initialRecipient} maxLength={200} required />
      <TextAreaField label="Message" name="body" rows={6} defaultValue={suggestedBody ?? reminder?.body ?? template} maxLength={2000} required />
      {reminder && <p className="muted">Saving changes turns this back into a draft that needs approval again.</p>}
    </CommandForm>
  );
  const editAction: InlineAction = { key: "edit", label: "Edit message", content: draftForm };
  const submitForm = (label: string) => reminder && (
    <CommandForm
      key={`submit-${reminder.id}-${reminder.version}`}
      revision={workspace.revision}
      label={label}
      build={() => ({ type: "submit_reminder", payload: { id: reminder.id, reminderVersion: reminder.version } })}
    >{null}</CommandForm>
  );

  const Container = collapsible ? "details" : "section";
  return (
    <Container className={collapsible ? "panel disclosure reminder-panel" : "panel reminder-panel"} aria-labelledby={collapsible ? undefined : "reminder-heading"}>
      {collapsible ? (
        <summary>
          <AppIcon name="mail" />
          <span className="action-text"><span>Payment reminder</span><small>Write a message to the customer. The owner approves it before you copy and send it yourself.</small></span>
          {reminder ? <span className={`next-chip action-state is-${reminder.state}`}>{REMINDER_STATE[reminder.state] ?? reminder.state.replaceAll("_", " ")}</span>
            : reported && <span className="next-chip action-state is-approved">Sent</span>}
          <AppIcon name="chevron-down" />
        </summary>
      ) : <h2 id="reminder-heading">Payment reminder</h2>}

      <div className="reminder-body">
        {unpaid && (
          <ol className="reminder-steps" aria-label="Reminder steps">
            {STEPS.map((label, index) => (
              <li key={label} className={index < step ? "is-done" : index === step ? "is-current" : undefined} aria-current={index === step ? "step" : undefined}>
                <span className="reminder-step-dot" aria-hidden="true">{index < step ? "\u2713" : index + 1}</span>{label}
              </li>
            ))}
          </ol>
        )}

        <p className={`reminder-next${state === "rejected" || legacyApproval ? " is-warn" : ""}`}>{next}</p>
        {reminder?.rejection_reason && state === "rejected" && <blockquote className="reminder-feedback"><strong>Owner&rsquo;s note:</strong> {reminder.rejection_reason}</blockquote>}

        {reminder && (
          <div className="reminder-message">
            <p className="reminder-to"><span>To</span> {state === "approved" && reminder.approved_recipient ? reminder.approved_recipient : reminder.recipient}</p>
            <blockquote>{reminder.body}</blockquote>
          </div>
        )}

        {unpaid && !reminder && !reported && draftForm}

        {unpaid && !reminder && reported && (
          <InlineActions defaultActive={suggestedBody ? "new" : null} actions={[{ key: "new", label: "Write another reminder", content: draftForm }]} />
        )}

        {unpaid && reminder && (state === "draft" || state === "rejected" || legacyApproval) && (
          <InlineActions defaultActive={suggestedBody ? "edit" : null} lead={legacyApproval ? undefined : submitForm("Ask owner to approve")} actions={[editAction]} />
        )}

        {unpaid && reminder && state === "awaiting_review" && (
          isOwner && approvalDigest ? (
            <InlineActions
              defaultActive={suggestedBody ? "edit" : null}
              lead={
                <CommandForm
                  key={`approve-${reminder.id}-${reminder.version}`}
                  revision={workspace.revision}
                  label="Approve message"
                  build={() => ({ type: "approve_reminder", payload: { id: reminder.id, reminderVersion: reminder.version, approvalBasis: approvalDigest } })}
                >{null}</CommandForm>
              }
              actions={[
                {
                  key: "changes", label: "Ask for changes", content: (
                    <CommandForm
                      key={`reject-${reminder.id}-${reminder.version}`}
                      revision={workspace.revision}
                      label="Send back with note"
                      build={(data) => ({ type: "reject_reminder", payload: { id: reminder.id, reminderVersion: reminder.version, approvalBasis: approvalDigest, reason: String(data.get("reason")) } })}
                    >
                      <Field label="What should change?" name="reason" maxLength={4000} required />
                    </CommandForm>
                  ),
                },
                editAction,
              ]}
            />
          ) : (
            <InlineActions defaultActive={suggestedBody ? "edit" : null} lead={submitForm(isOwner ? "Ask for approval" : "Send again for approval")} actions={[editAction]} />
          )
        )}

        {unpaid && reminder && state === "approved" && !legacyApproval && (
          <>
            <InlineActions
              lead={
                <button className="row-action is-main" type="button" onClick={copyApprovedText} disabled={copyPending}>
                  {copyPending ? "Checking approval\u2026" : "Copy message"}
                </button>
              }
              actions={[
                {
                  key: "sent", label: "Mark as sent", content: (
                    <CommandForm
                      key={`report-${reminder.id}-${reminder.version}`}
                      revision={workspace.revision}
                      label="Mark as sent"
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
                        <Field label="How you sent it" name="channel" maxLength={200} placeholder="Email, text or chat app" required />
                        <Field label="When" name="sentAt" type="datetime-local" defaultValue={localDateTimeValue()} required />
                      </div>
                      <p className="muted">This is your note of what you did. PondoPath can&rsquo;t confirm the customer got it.</p>
                    </CommandForm>
                  ),
                },
                editAction,
              ]}
            />
            {copyNotice && <p role="status" className="form-feedback">{copyNotice}</p>}
            {copyError && <p role="alert" className="form-feedback error-feedback">{copyError}</p>}
            {copyText && <label className="form-field reminder-copy-fallback"><span>Approved text to copy manually</span><textarea className="field" readOnly rows={5} value={copyText} onFocus={(event) => event.currentTarget.select()} /></label>}
          </>
        )}

        {unpaid && <p className="reminder-hint">PondoPath never sends messages for you. Balance still owed: <strong className="num">{formatPHP(invoice.outstanding_cents)}</strong></p>}
      </div>
    </Container>
  );
}
