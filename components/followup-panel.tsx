"use client";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPlanDate, followupDue } from "@/lib/display";
import { CommandForm, Field, TextAreaField, AssigneeField } from "./command-form";
import { InlineActions } from "./inline-actions";

type Props = { workspace: WorkspaceSnapshot; invoice: WorkspaceSnapshot["invoices"][number]; hideHeading?: boolean };
export function FollowupForm({
  workspace,
  invoice,
  task,
  proposed,
}: Props & { task?: WorkspaceSnapshot["followups"][number]; proposed?: { nextAction?: string; date?: string } }) {
  return (
    <CommandForm
      revision={workspace.revision}
      label={task ? "Save follow-up" : "Schedule follow-up"}
      build={(data) => ({
        type: "save_followup",
        payload: {
          ...(task ? { id: task.id } : {}),
          invoiceId: invoice.id,
          date: String(data.get("date")),
          nextAction: String(data.get("nextAction")),
          assigneeId: String(data.get("assigneeId")),
        },
      })}
    >
      <TextAreaField
        label="Next action"
        name="nextAction"
        maxLength={4000}
        defaultValue={task?.next_action ?? proposed?.nextAction ?? ""}
        required
      />
      <div className="form-grid">
        <Field
          label="Follow-up due date"
          name="date"
          type="date"
          defaultValue={task?.due_date ?? proposed?.date ?? workspace.forecastInput.referenceDate}
          required
        />
        <AssigneeField
          members={workspace.members}
          defaultValue={task?.assignee_id ?? workspace.actor.userId}
        />
      </div>
    </CommandForm>
  );
}
function CompleteForm({
  workspace,
  invoice,
  task,
}: Props & { task: WorkspaceSnapshot["followups"][number] }) {
  const unresolved = invoice.outstanding_cents > 0;
  return (
    <CommandForm
      revision={workspace.revision}
      label="Record outcome and complete task"
      build={(data) => ({
        type: "complete_followup",
        payload: {
          id: task.id,
          outcome: String(data.get("outcome")),
          assigneeId: String(data.get("assigneeId")),
          ...(unresolved
            ? { nextAction: String(data.get("nextAction")), nextDate: String(data.get("nextDate")) }
            : {}),
        },
      })}
    >
      <TextAreaField label="Follow-up outcome" name="outcome" maxLength={4000} required />
      {unresolved && (
        <>
          <p className="muted">
            Money remains unpaid. Completing this task also schedules the next action; it does not
            mark the invoice paid.
          </p>
          <TextAreaField
            label="Next action after this outcome"
            name="nextAction"
            maxLength={4000}
            required
          />
          <Field
            label="Next action date"
            name="nextDate"
            type="date"
            min={workspace.forecastInput.referenceDate}
            defaultValue={workspace.forecastInput.referenceDate}
            required
          />
        </>
      )}
      <AssigneeField members={workspace.members} defaultValue={task.assignee_id} />
    </CommandForm>
  );
}

export function FollowupPanel({ workspace, invoice, hideHeading = false }: Props) {
  const today = workspace.forecastInput.referenceDate;
  const tasks = workspace.followups
    .filter((row) => row.invoice_id === invoice.id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
  const open = tasks.filter((row) => row.state === "open"),
    completed = tasks.filter((row) => row.state === "completed");
  const unpaid = invoice.outstanding_cents > 0;
  const who = (id: string) => id === workspace.actor.userId ? "You"
    : workspace.members.find((member) => member.user_id === id)?.display_name ?? "Previous team member";
  return (
    <section className="panel followup-panel" aria-labelledby={`followups-${invoice.id}`}>
      <div className={hideHeading ? "sr-only" : "followup-head"}>
        <h2 id={`followups-${invoice.id}`}>Follow-ups{hideHeading ? ` for ${invoice.number}` : ""}</h2>
        {open.length > 0 && <span className="next-count">{open.length} open</span>}
      </div>
      {open.length ? (
        <ul className="followup-tasks">
          {open.map((task) => {
            const due = followupDue(task.due_date, today);
            return (
              <li id={`followup-${task.id}`} key={task.id} className={`followup-task is-${due.tone}`}>
                <h3>{task.next_action}</h3>
                <div className="followup-meta">
                  <span className={`next-chip due-${due.tone === "late" ? "late" : due.tone === "today" ? "soon" : "calm"}`}>{due.text}</span>
                  <span className={`next-chip${who(task.assignee_id) === "You" ? " is-mine" : ""}`}>{who(task.assignee_id) === "You" ? <><span className="sr-only">Assigned to </span>You</> : `Assigned to ${who(task.assignee_id)}`}</span>
                </div>
                {task.automatic_type === "correction_review" && <p className="muted">Correction review · {task.outcome}</p>}
                {/* One main action (what happened), one quiet one (change it). Each opens its form in place. */}
                <InlineActions actions={[
                  { key: "done", label: "Record what happened", tone: "main", content: <CompleteForm workspace={workspace} invoice={invoice} task={task} /> },
                  ...(unpaid ? [{ key: "change", label: "Change", content: <FollowupForm workspace={workspace} invoice={invoice} task={task} /> }] : []),
                ]} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="followup-empty">{unpaid ? "Nothing scheduled. Plan the next step to collect this payment." : "No follow-up needed. This invoice is fully received."}</p>
      )}
      {unpaid && (
        <div className="followup-add">
          <InlineActions actions={[{ key: "add", label: open.length ? "+ Add another follow-up" : "+ Schedule a follow-up", tone: open.length ? "quiet" : "main",
            content: <FollowupForm workspace={workspace} invoice={invoice} /> }]} />
        </div>
      )}
      {completed.length > 0 && (
        <details className="disclosure followup-done">
          <summary>Done · {completed.length}</summary>
          <ul className="movement-list">
            {completed.map((task) => (
              <li id={`followup-${task.id}`} key={task.id}>
                <strong>{task.next_action}</strong>
                <p>{task.outcome || "Resolved by a reviewed update."}</p>
                <p className="muted">
                  {task.completion_source === "cash_movement"
                    ? "Resolved by a verified receipt"
                    : "Completed through review"}
                  {task.next_date ? ` · Next step scheduled ${formatPlanDate(task.next_date, true)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
