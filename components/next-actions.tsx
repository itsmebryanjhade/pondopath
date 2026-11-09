import Link from "next/link";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPlanDate } from "@/lib/display";
import { buildNextActions, type NextAction } from "@/lib/ui/next-actions";
import { DashboardIcon } from "./dashboard-icon";
import { AiContextButton } from "./ai-context-button";

type Props = { workspace: WorkspaceSnapshot; limit?: number; viewAllHref?: string; origin?: "overview" | "followups"; showFollowupAssistant?: boolean };

/** Says what the date belongs to, so it never reads like a second, conflicting payment date. */
function dueLabel(action: NextAction, referenceDate: string) {
  const { dueDate } = action;
  if (!dueDate) return "No date set";
  const what = action.id.startsWith("followup:") ? "Follow-up" : action.kind === "missed_promise" ? "Payment" : action.kind === "reminder_review" ? "Invoice" : "";
  const day = formatPlanDate(dueDate, true);
  if (dueDate < referenceDate) return what ? `${what} late since ${day}` : `Overdue since ${day}`;
  if (dueDate === referenceDate) return what ? `${what} due today` : "Due today";
  return what ? `${what} due ${day}` : `Due ${day}`;
}

const DAY = 86_400_000;
/** Red when late, amber when due within three days or waiting on a review, otherwise calm. */
function tone(action: NextAction, referenceDate: string): "late" | "soon" | "calm" {
  if (action.kind === "missed_promise" || (action.dueDate && action.dueDate < referenceDate)) return "late";
  if (action.ownerReviewRequired || action.kind === "intake_review") return "soon";
  if (action.dueDate && Date.parse(action.dueDate) - Date.parse(referenceDate) <= 3 * DAY) return "soon";
  return "calm";
}

const BUTTON: Record<NextAction["kind"], string> = {
  missed_promise: "Open invoice", followup: "Open invoice", missing_expectation: "Open invoice",
  reminder_review: "Review reminder", intake_review: "Review row",
};

export function NextActions({ workspace, limit, viewAllHref, origin, showFollowupAssistant }: Props) {
  const allActions = buildNextActions(workspace);
  const actions = limit === undefined ? allActions : allActions.slice(0, limit);
  const firstFollowup = showFollowupAssistant ? actions.find(action => action.id.startsWith("followup:")) : undefined;
  const followupInvoiceId = firstFollowup && workspace.followups.find(task => `followup:${task.id}` === firstFollowup.id)?.invoice_id;
  const memberById = new Map(workspace.members.map((member) => [member.user_id, member.display_name]));
  const referenceDate = workspace.forecastInput.referenceDate;

  return (
    <section className="panel next-actions-panel" aria-labelledby="next-actions-heading">
      <div className="next-actions-head">
        <h2 id="next-actions-heading">Next actions</h2>
        {allActions.length > 0 && <span className="next-count">{allActions.length} to do</span>}
        {viewAllHref && allActions.length > actions.length && (
          <Link className="text-link next-view-all" href={viewAllHref}>View all {allActions.length}</Link>
        )}
      </div>
      {actions.length ? (
        <ul className="next-actions-list" aria-label="Next action worklist">
          {actions.map((action, index) => {
            const assignee = action.assigneeId ? memberById.get(action.assigneeId) : undefined;
            const mine = action.assigneeId === workspace.actor.userId;
            const level = tone(action, referenceDate);
            return (
              <li className={`next-actions-item tone-${level}${index === 0 ? " is-first" : ""}`} key={action.id}>
                <div className="next-actions-copy">
                  {index === 0 && <span className="next-first-label">Do this first</span>}
                  <strong>{action.headline}</strong>
                  <p>{action.detail}</p>
                  {action.note && <p className="next-note">Next step: {action.note}</p>}
                  <div className="next-actions-meta">
                    <span className={`next-chip due-${level}`}>{dueLabel(action, referenceDate)}</span>
                    {mine ? <span className="next-chip is-mine"><span className="sr-only">Assigned to </span>You</span>
                      : <span className="next-chip">{assignee ? `Assigned to ${assignee}` : "Unassigned"}</span>}
                    {action.ownerReviewRequired && <span className="next-chip">Owner review required</span>}
                  </div>
                  {action === firstFollowup && followupInvoiceId && (
                    <AiContextButton entry={{
                      context: { page: origin === "overview" ? "overview" : "followups", record: { kind: "invoice", id: followupInvoiceId } },
                      workspace, starterText: "Help me follow up on this invoice",
                      intent: "draft_followup",
                    }}>Help me follow up</AiContextButton>
                  )}
                </div>
                <Link className="next-action-button" href={origin && action.href.startsWith("/invoices/") ? `${action.href}?from=${origin}` : action.href} aria-label={`Review action: ${action.title}. ${action.detail}`}>
                  {BUTTON[action.kind]}<DashboardIcon name="arrowRight" size={15} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-state next-actions-empty"><DashboardIcon name="check" size={16} />All caught up. New follow-ups, missing payment dates and reminders will show here.</p>
      )}
    </section>
  );
}
