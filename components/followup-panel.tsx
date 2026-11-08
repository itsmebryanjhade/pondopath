"use client";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPlanDate } from "@/lib/display";
import { CommandForm, Field, TextAreaField, AssigneeField } from "./command-form";

type Props = { workspace: WorkspaceSnapshot; invoice: WorkspaceSnapshot["invoices"][number] };
function FollowupForm({
  workspace,
  invoice,
  task,
}: Props & { task?: WorkspaceSnapshot["followups"][number] }) {
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
        defaultValue={task?.next_action ?? ""}
        required
      />
      <div className="form-grid">
        <Field
          label="Follow-up due date"
          name="date"
          type="date"
          defaultValue={task?.due_date ?? workspace.forecastInput.referenceDate}
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

export function FollowupPanel({ workspace, invoice }: Props) {
  const tasks = workspace.followups
    .filter((row) => row.invoice_id === invoice.id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id));
  const open = tasks.filter((row) => row.state === "open"),
    completed = tasks.filter((row) => row.state === "completed");
  return (
    <section className="panel followup-panel">
      <h2>Follow-ups · {open.length} open</h2>
      {open.length ? (
        <ul className="movement-list">
          {open.map((task) => (
            <li id={`followup-${task.id}`} key={task.id}>
              <div className="section-heading">
                <div>
                  <h3>{task.next_action}</h3>
                  <p
                    className={
                      task.due_date < workspace.forecastInput.referenceDate ? "negative" : "muted"
                    }
                  >
                    {task.due_date < workspace.forecastInput.referenceDate ? "Overdue · " : "Due "}
                    <time dateTime={task.due_date}>{formatPlanDate(task.due_date, true)}</time> ·{" "}
                    {workspace.members.find((member) => member.user_id === task.assignee_id)
                      ?.display_name ?? "Previous team member"}
                  </p>
                </div>
              </div>
              {task.automatic_type === "correction_review" && (
                <p className="muted">Correction review · {task.outcome}</p>
              )}
              <div className="two-column">
                <details className="disclosure">
                  <summary>Record outcome</summary>
                  <CompleteForm workspace={workspace} invoice={invoice} task={task} />
                </details>
                {invoice.outstanding_cents > 0 && (
                  <details className="disclosure">
                    <summary>Edit follow-up</summary>
                    <FollowupForm workspace={workspace} invoice={invoice} task={task} />
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">
          No open follow-up.{" "}
          {invoice.outstanding_cents > 0
            ? "Schedule the next collection action."
            : "This invoice is fully received."}
        </p>
      )}
      {invoice.outstanding_cents > 0 && (
        <details className="disclosure">
          <summary>Add follow-up</summary>
          <FollowupForm workspace={workspace} invoice={invoice} />
        </details>
      )}
      {completed.length > 0 && (
        <details className="disclosure">
          <summary>Completed follow-ups · {completed.length}</summary>
          <ul className="movement-list">
            {completed.map((task) => (
              <li id={`followup-${task.id}`} key={task.id}>
                <strong>{task.next_action}</strong>
                <p>{task.outcome || "Resolved by a reviewed update."}</p>
                <p className="muted">
                  {task.completion_source === "cash_movement"
                    ? "Resolved by a verified receipt"
                    : "Completed through review"}
                  {task.next_date ? ` · Next action scheduled ${task.next_date}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
