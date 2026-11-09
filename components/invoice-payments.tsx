import type { getCashMovements, WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { InlineActions } from "./inline-actions";
import { VoidForm } from "./payment-form";
import { FocusHashOnArrival } from "./jump-link";

/**
 * Payments received on one invoice: when each payment came in and how much, newest first.
 * The customer is already the page's subject, so rows lead with the date and amount.
 * Voided payments stay listed, crossed out, and never count.
 */
export function InvoicePayments({
  movements,
  workspace,
  selected = false,
}: {
  movements: Awaited<ReturnType<typeof getCashMovements>>;
  workspace: WorkspaceSnapshot;
  selected?: boolean;
}) {
  const rows = [...movements].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const counted = rows.filter((row) => !row.voided_at);
  const totalCents = counted.reduce((sum, row) => sum + row.amount_cents, 0);
  const isOwner = workspace.actor.role === "owner";
  const who = (id: string) => id === workspace.actor.userId ? "you"
    : workspace.members.find((member) => member.user_id === id)?.display_name ?? "a teammate";

  return (
    <section className="panel invoice-payments" id="payment-history" aria-labelledby="payment-history-heading">
      <header className="invoice-payments-head">
        <h2 id="payment-history-heading">{selected ? "Selected payment" : "Payments received"}</h2>
        {!selected && counted.length > 0 && (
          <p className="invoice-payments-total"><strong className="num">{formatPHP(totalCents)}</strong> in {counted.length} {counted.length === 1 ? "payment" : "payments"}</p>
        )}
      </header>

      {rows.length ? (
        <ul className="invoice-payment-list">
          {rows.map((row) => {
            const voided = !!row.voided_at;
            return (
              <li id={`movement-${row.id}`} tabIndex={-1} key={row.id} className={voided ? "is-voided" : undefined}>
                <div className="invoice-payment-row">
                  <div className="invoice-payment-main">
                    <strong><time dateTime={row.payment_date}>{formatPlanDate(row.payment_date)}</time></strong>
                    <small>{[row.reference ? `Ref ${row.reference}` : null, `Recorded by ${who(row.recorded_by)}`].filter(Boolean).join(" · ")}</small>
                    {voided && <small className="invoice-payment-void">Voided{row.void_reason ? `: ${row.void_reason}` : ""} · doesn&rsquo;t count</small>}
                  </div>
                  <strong className="invoice-payment-amount num">{voided ? "" : "+"}{formatPHP(row.amount_cents)}</strong>
                </div>
                {!voided && isOwner && (
                  <InlineActions actions={[{
                    key: "void", label: "Delete this payment", ariaLabel: `Delete the ${formatPHP(row.amount_cents)} payment from ${formatPlanDate(row.payment_date)}`,
                    content: <VoidForm revision={workspace.revision} movementId={row.id} kind="receipt" />,
                  }]} />
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="invoice-payments-empty">No payments yet. When the money arrives, use <strong>Record payment</strong> at the top of this page.</p>
      )}

      <FocusHashOnArrival prefix="movement-" />
      {(rows.length >= 50 || (!isOwner && counted.length > 0)) && (
        <p className="invoice-payments-foot">
          {!isOwner && counted.length > 0 ? "Recorded a payment by mistake? Ask the owner to void it." : ""}
          {rows.length >= 50 ? " Showing the latest 50 payments." : ""}
        </p>
      )}
    </section>
  );
}
