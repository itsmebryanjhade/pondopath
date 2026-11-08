import Link from "next/link";
import type { Json } from "@/lib/database.types";
import type { AuditEvent, WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { AppIcon } from "./app-icon";

function object(value: Json | undefined): { [key: string]: Json | undefined } {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}
function money(value: Json | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) ? formatPHP(value) : "—";
}

export function RecordHistory({
  invoiceId,
  events,
  nextCursor,
  cursor,
  members,
}: {
  invoiceId: string;
  events: AuditEvent[];
  nextCursor: string | null;
  cursor?: string;
  members: WorkspaceSnapshot["members"];
}) {
  const base = `/invoices/${invoiceId}`;
  return (
    <section className="panel" id="record-history">
      <h2>Invoice history</h2>
      <p className="muted">
        Recorded changes, receipt plans and follow-up outcomes. Times are shown in Manila time.
      </p>
      {events.length ? (
        <ol className="movement-list">
          {events.map((event) => {
            const change = object(event.change),
              before = object(change.before),
              after = object(change.after);
            const operation = text(change.operation),
              movement = text(change.movementId);
            const receipt =
              movement &&
              typeof before.paid_cents === "number" &&
              typeof after.paid_cents === "number";
            const voided = receipt && (after.paid_cents as number) < (before.paid_cents as number);
            const title =
              operation === "confirm_expectation"
                ? "Receipt expectation confirmed"
                : operation === "save_followup"
                  ? "Follow-up scheduled or updated"
                  : operation === "complete_followup"
                    ? "Follow-up completed"
                    : receipt
                      ? voided
                        ? "Receipt voided · Unpaid balance restored"
                        : "Verified receipt recorded"
                      : "Invoice details saved";
            const next = text(change.nextFollowupId),
              priorVoid = object(object(change.effects).priorVoid);
            return (
              <li key={event.id}>
                <details className="invoice-history-entry">
                  <summary>
                    <span>
                      <strong>{title}</strong>
                      <small>
                        {new Date(event.created_at).toLocaleString("en-PH", {
                          timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
                        })} ·{" "}
                        {members.find((member) => member.user_id === event.actor_id)?.display_name ?? "Previous team member"}
                      </small>
                    </span>
                    <AppIcon name="chevron-down" />
                  </summary>
                  <div className="invoice-history-details">
                    {operation === "confirm_expectation" ? (
                      <>
                        <p>
                          {money(before.remaining_cents)} on{" "}
                          {text(before.expected_date) || "no prior date"} →{" "}
                          {money(after.remaining_cents)} on {text(after.expected_date)}
                        </p>
                        <p>
                          {after.kind === "commitment"
                            ? "Customer-confirmed promise"
                            : "Planning assumption"}{" "}
                          ·{" "}
                          {after.state === "needs_review"
                            ? "Needs review; excluded from projected inflows"
                            : "Expected receipt; actual cash unchanged"}
                        </p>
                        <blockquote>{text(after.source_note)}</blockquote>
                      </>
                    ) : operation === "save_followup" || operation === "complete_followup" ? (
                      <>
                        <p>{text(after.next_action)}</p>
                        <p className="muted">
                          Due {text(after.due_date)} ·{" "}
                          {members.find((member) => member.user_id === after.assignee_id)
                            ?.display_name ?? "Previous team member"}
                        </p>
                        {after.outcome && <blockquote>{text(after.outcome)}</blockquote>}
                        {after.next_date && <p>Next action date: {text(after.next_date)}</p>}
                      </>
                    ) : receipt ? (
                      <p>
                        Verified receipts: {money(before.paid_cents)} → {money(after.paid_cents)}.
                        Outstanding: {money(before.outstanding_cents)} →{" "}
                        {money(after.outstanding_cents)}.
                      </p>
                    ) : (
                      <p>
                        Invoice total: {money(before.amount_cents)} → {money(after.amount_cents)} ·
                        Original due date: {text(before.due_date) || "—"} → {text(after.due_date)}
                      </p>
                    )}
                    {event.reason && operation !== "complete_followup" && (
                      <blockquote>{event.reason}</blockquote>
                    )}
                    {movement && (
                      <Link href={`${base}?movement=${encodeURIComponent(movement)}#payment-history`}>
                        View retained payment record
                      </Link>
                    )}
                    {text(priorVoid.id) && (
                      <p>
                        Replacement follows a previous void.{" "}
                        <Link
                          href={`${base}?movement=${encodeURIComponent(text(priorVoid.id))}#payment-history`}
                        >
                          View previous void
                        </Link>
                      </p>
                    )}
                    {next && (
                      <p>
                        <Link href={`${base}#followup-${next}`}>View next follow-up</Link>
                      </p>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="empty-state">No recorded changes on this page.</p>
      )}
      <nav className="pagination" aria-label="Invoice history pages">
        {cursor && <Link href={`${base}#record-history`}>Latest changes</Link>}
        {nextCursor && (
          <Link href={`${base}?history=${encodeURIComponent(nextCursor)}#record-history`}>
            Older changes
          </Link>
        )}
      </nav>
    </section>
  );
}
