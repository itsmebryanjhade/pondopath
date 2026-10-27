import type { getCashMovements, WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { VoidForm } from "./payment-form";

export function CashMovements({
  movements,
  workspace,
  selected = false,
}: {
  movements: Awaited<ReturnType<typeof getCashMovements>>;
  workspace: WorkspaceSnapshot;
  selected?: boolean;
}) {
  return (
    <section className="panel" id="payment-history">
      <h2>{selected ? "Retained payment record" : "Recent actual payments"}</h2>
      <p className="muted">
        {selected ? "Selected from invoice history." : "Latest 50 entries in this view."} A void
        retains the original record and reference.
      </p>
      {movements.length ? (
        <ul className="movement-list">
          {movements.map((movement) => (
            <li id={`movement-${movement.id}`} key={movement.id}>
              <div className="section-heading">
                <div>
                  <strong>{movement.reference || "No payment reference"}</strong>
                  <p className="muted">
                    {movement.payment_date} ·{" "}
                    {movement.invoice_id
                      ? workspace.invoices.find((row) => row.id === movement.invoice_id)?.number
                      : workspace.expenses.find((row) => row.id === movement.expense_id)?.label}
                  </p>
                </div>
                <span className="num">{formatPHP(movement.amount_cents)}</span>
              </div>
              {movement.voided_at ? (
                <p className="muted">Voided: {movement.void_reason}</p>
              ) : workspace.actor.role === "owner" ? (
                <details className="disclosure">
                  <summary>Correct this payment entry</summary>
                  <VoidForm revision={workspace.revision} movementId={movement.id} />
                </details>
              ) : (
                <p className="muted">Recorded · Only the owner can void an incorrect entry.</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">No actual payments recorded in this view.</p>
      )}
    </section>
  );
}
