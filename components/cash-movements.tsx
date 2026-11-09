import type { getCashMovements, WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { historyRows } from "@/lib/ui/cash-overview";
import { AppIcon } from "./app-icon";
import { DashboardIcon } from "./dashboard-icon";
import { VoidForm } from "./payment-form";
import { FocusHashOnArrival } from "./jump-link";

export function CashMovements({
  movements,
  workspace,
  selected = false,
  kind,
}: {
  movements: Awaited<ReturnType<typeof getCashMovements>>;
  workspace: WorkspaceSnapshot;
  selected?: boolean;
  kind?: "receipt" | "expense_payment";
}) {
  const sectionId = kind === "receipt" ? "receipt-history" : "payment-history";
  const billPayments = kind === "expense_payment";
  const rows = historyRows(workspace, movements);

  return (
    <section className="panel cash-movements" id={sectionId} aria-labelledby={`${sectionId}-heading`}>
      <header className="mini-chart-head">
        <div>
          <h2 id={`${sectionId}-heading`}>
            {selected ? "Selected payment" : billPayments ? "Bill payments" : "Payments received"}
          </h2>
          <span>{selected ? "Selected from invoice history." : "Newest first."} Voided payments stay listed but don&rsquo;t count.</span>
        </div>
      </header>
      {rows.length ? (
        <ul className="history-list">
          {rows.map((row) => (
            <li id={`movement-${row.id}`} tabIndex={-1} key={row.id}>
              <div className={`history-row is-${row.direction}${row.voided ? " is-voided" : ""}`}>
                <span className="history-icon" aria-hidden="true">
                  <DashboardIcon name={row.direction === "in" ? "arrowIn" : "arrowOut"} size={16} />
                </span>
                <div className="history-main">
                  <strong>{row.who}</strong>
                  <small>
                    {row.what} · <time dateTime={row.paymentDate}>{formatPlanDate(row.paymentDate, true)}</time>
                    {row.reference ? ` · Ref ${row.reference}` : ""}
                  </small>
                  {row.voided && <small className="history-void">Voided{row.voidReason ? `: ${row.voidReason}` : ""}</small>}
                </div>
                <strong className="history-amount num">{row.direction === "in" ? "+" : "−"}{formatPHP(row.amountCents)}</strong>
              </div>
              {!row.voided && (workspace.actor.role === "owner" ? (
                <details
                  className="disclosure cash-movement-correction"
                  name={billPayments ? "bill-payment-corrections" : "receipt-corrections"}
                >
                  <summary className="row-action is-quiet" aria-label={billPayments ? `Delete payment for ${row.what}` : undefined}>
                    Delete payment <AppIcon name="chevron-down" />
                  </summary>
                  <VoidForm revision={workspace.revision} movementId={row.id} kind={kind} />
                </details>
              ) : (
                <p className="muted cash-movement-correction">Only the owner can delete an incorrect payment.</p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">No payments recorded yet.</p>
      )}
      <FocusHashOnArrival prefix="movement-" />
      {!selected && <p className="muted cash-movements-limit">Showing up to 50 payments.</p>}
    </section>
  );
}
