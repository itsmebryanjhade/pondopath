import Link from "next/link";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPlanDate } from "@/lib/display";
import { buildNextActions } from "@/lib/ui/next-actions";

type Props = { workspace: WorkspaceSnapshot; limit?: number; viewAllHref?: string; heading?: string; description?: string };

function dueLabel(dueDate: string | null, referenceDate: string) {
  if (!dueDate) return "No date set";
  if (dueDate < referenceDate) return `Overdue · ${formatPlanDate(dueDate)}`;
  if (dueDate === referenceDate) return "Due today";
  return `Due ${formatPlanDate(dueDate)}`;
}

export function NextActions({ workspace, limit, viewAllHref, heading = "Next actions", description = "Review the records that need a follow-up or owner decision." }: Props) {
  const allActions = buildNextActions(workspace);
  const actions = limit === undefined ? allActions : allActions.slice(0, limit);
  const memberById = new Map(workspace.members.map((member) => [member.user_id, member.display_name]));

  return (
    <section className="panel next-actions-panel" aria-labelledby="next-actions-heading">
      <div className="next-actions-head">
        <div>
          <h2 id="next-actions-heading">{heading}</h2>
          <p>{description}</p>
        </div>
        {viewAllHref && allActions.length > actions.length && (
          <Link className="text-link" href={viewAllHref}>View all {allActions.length} actions</Link>
        )}
      </div>
      {actions.length ? (
        <ul className="next-actions-list" aria-label="Next action worklist">
          {actions.map((action) => {
            const assignee = action.assigneeId ? memberById.get(action.assigneeId) : undefined;
            return (
              <li className="next-actions-item" key={action.id}>
                <div className="next-actions-copy">
                  <strong>{action.title}</strong>
                  <p>{action.detail}</p>
                  <div className="next-actions-meta">
                    <span>{assignee ? `Assigned to ${assignee}` : "Unassigned"}</span>
                    <span>{dueLabel(action.dueDate, workspace.forecastInput.referenceDate)}</span>
                    {action.ownerReviewRequired && <span>Owner review required</span>}
                  </div>
                </div>
                <Link className="text-link" href={action.href} aria-label={`Review action: ${action.title}. ${action.detail}`}>
                  Review
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty-state next-actions-empty">No actions need attention. New follow-ups, missing payment dates, and reminder reviews will appear here.</p>
      )}
    </section>
  );
}
