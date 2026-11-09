import Link from "next/link";
import type { Json } from "@/lib/database.types";
import type { AuditEvent, WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { AppIcon } from "./app-icon";
import { formatPlanDate } from "@/lib/display";

function object(value: Json | undefined): { [key: string]: Json | undefined } {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}
function money(value: Json | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) ? formatPHP(value) : "—";
}

/** A stored YYYY-MM-DD as "2 Nov 2026"; anything else as-is. */
function day(value: Json | undefined) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? formatPlanDate(raw) : raw;
}

type Kind = "payment" | "void" | "plan" | "followup" | "edit";

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
  const person = (id: Json | undefined) => members.find((member) => member.user_id === id)?.display_name ?? "Previous team member";
  return (
    <section className="panel invoice-history" id="record-history" aria-labelledby="record-history-heading">
      <header className="invoice-history-head">
        <h2 id="record-history-heading">Invoice history</h2>
        <p className="muted">Every change to this invoice, newest first.</p>
      </header>
      {events.length ? (
        <ol className="invoice-history-list">
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
            const paidChange = receipt ? Math.abs((after.paid_cents as number) - (before.paid_cents as number)) : 0;
            const created = !operation && !receipt && Object.keys(before).length === 0;
            const totalChanged = before.amount_cents !== after.amount_cents;
            const dueChanged = before.due_date !== after.due_date;

            // A plain title, plus the one fact worth seeing without opening the entry.
            const [kind, title, fact]: [Kind, string, string] =
              operation === "confirm_expectation"
                ? ["plan", "Expected payment set", `${money(after.remaining_cents)} on ${day(after.expected_date) || "no date"} · ${after.kind === "commitment" ? "Customer promise" : "Your estimate"}`]
                : operation === "save_followup"
                  ? ["followup", "Follow-up scheduled", text(after.next_action)]
                  : operation === "complete_followup"
                    ? ["followup", "Follow-up done", text(after.outcome) || text(after.next_action)]
                    : receipt
                      ? voided
                        ? ["void", "Payment voided", `${formatPHP(paidChange)} added back to what\u2019s owed`]
                        : ["payment", "Payment recorded", `+${formatPHP(paidChange)} · ${money(after.outstanding_cents)} still owed`]
                      : created
                        ? ["edit", "Invoice created", `${money(after.amount_cents)} · due ${day(after.due_date)}`]
                        : ["edit", "Invoice details changed", [
                            totalChanged ? `Total ${money(before.amount_cents)} → ${money(after.amount_cents)}` : "",
                            dueChanged ? `Due ${day(before.due_date)} → ${day(after.due_date)}` : "",
                          ].filter(Boolean).join(" · ") || "Number or customer updated"];
            const next = text(change.nextFollowupId),
              priorVoid = object(object(change.effects).priorVoid);
            return (
              <li key={event.id} className={`is-${kind}`}>
                <span className="invoice-history-dot" aria-hidden="true" />
                <details className="invoice-history-entry">
                  <summary>
                    <span>
                      <strong>{title}</strong>
                      {fact && <span className="invoice-history-fact">{fact}</span>}
                      <small>
                        {new Date(event.created_at).toLocaleString("en-PH", {
                          timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short",
                        })} · {person(event.actor_id)}
                      </small>
                    </span>
                    <AppIcon name="chevron-down" />
                  </summary>
                  <div className="invoice-history-details">
                    {operation === "confirm_expectation" ? (
                      <>
                        <p>
                          Before: {money(before.remaining_cents)} on {day(before.expected_date) || "no date"}. Now: {money(after.remaining_cents)} on {day(after.expected_date)}.
                        </p>
                        <p className="muted">
                          {after.state === "needs_review"
                            ? "Needs review, so it isn\u2019t in the forecast."
                            : "In the forecast. Not counted as cash until the payment is recorded."}
                        </p>
                        {text(after.source_note) && <blockquote>{text(after.source_note)}</blockquote>}
                      </>
                    ) : operation === "save_followup" || operation === "complete_followup" ? (
                      <>
                        <p>{text(after.next_action)}</p>
                        <p className="muted">Due {day(after.due_date)} · {person(after.assignee_id)}</p>
                        {after.outcome && <blockquote>{text(after.outcome)}</blockquote>}
                        {after.next_date && <p>Next step on {day(after.next_date)}</p>}
                      </>
                    ) : receipt ? (
                      <p>
                        Received so far: {money(before.paid_cents)} → {money(after.paid_cents)}. Still owed: {money(before.outstanding_cents)} → {money(after.outstanding_cents)}.
                      </p>
                    ) : (
                      <p>
                        Total: {money(before.amount_cents)} → {money(after.amount_cents)} · Due date: {day(before.due_date) || "—"} → {day(after.due_date)}
                      </p>
                    )}
                    {event.reason && operation !== "complete_followup" && (
                      <blockquote><span className="muted">Reason: </span>{event.reason}</blockquote>
                    )}
                    {(movement || text(priorVoid.id) || next) && (
                      <p className="invoice-history-links">
                        {movement && <Link href={`${base}?movement=${encodeURIComponent(movement)}#payment-history`}>See the payment</Link>}
                        {text(priorVoid.id) && <Link href={`${base}?movement=${encodeURIComponent(text(priorVoid.id))}#payment-history`}>See the voided payment it replaces</Link>}
                        {next && <Link href={`${base}#followup-${next}`}>See the next follow-up</Link>}
                      </p>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="invoice-history-empty">No changes recorded yet.</p>
      )}
      {(cursor || nextCursor) && (
        <nav className="invoice-history-pages" aria-label="Invoice history pages">
          {cursor && <Link className="row-action is-quiet" href={`${base}#record-history`}>Latest changes</Link>}
          {nextCursor && (
            <Link className="row-action is-quiet" href={`${base}?history=${encodeURIComponent(nextCursor)}#record-history`}>
              Older changes
            </Link>
          )}
        </nav>
      )}
      <p className="invoice-history-foot">Times are in Philippine time.</p>
    </section>
  );
}
