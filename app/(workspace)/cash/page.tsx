import { Suspense } from "react";
import WorkspaceLoading from "../loading";
import { getWorkspace } from "@/lib/server/workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { OpeningCashForm } from "@/components/record-forms";
import { checkedSum, formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import Link from "next/link";

export default function CashPage() { return <Suspense fallback={<WorkspaceLoading />}><CashContent /></Suspense>; }

async function CashContent() {
  const workspace = await getWorkspace();
  return <WorkspaceShell workspace={workspace} header={<WorkspacePageHeading workspace={workspace} title="Cash position" description="Recorded money available today, kept separate from expected customer payments." />}>
    <dl className="view-metrics"><div className="panel"><dt>Recorded available cash</dt><dd className="num">{formatPHP(workspace.forecastInput.availableCents)}</dd></div><div className="panel"><dt>Opening cash baseline</dt><dd className="num">{formatPHP(workspace.business.opening_cash_cents)}</dd></div><div className="panel"><dt>Unpaid customer invoices</dt><dd className="num">{formatPHP(checkedSum(workspace.invoices.map((invoice) => invoice.outstanding_cents)))}</dd></div></dl>
    <section id="opening-cash" className="panel"><h2>Opening cash baseline</h2><p className="muted">Recorded on {formatPlanDate(workspace.business.opening_date)}. Actual receipts and expense payments change the available balance; customer promises do not.</p>
      {workspace.business.opening_locked_at ? <p className="form-feedback">Locked after the first actual movement. Correct a mistaken movement by voiding its retained entry; a baseline reset is outside this workspace.</p> : workspace.actor.role === "owner" ? <OpeningCashForm workspace={workspace} /> : <p className="form-feedback">Only the owner can set opening cash.</p>}
      <p className="form-feedback"><Link className="text-link" href="/payments">Review actual receipts and payments →</Link></p>
    </section>
  </WorkspaceShell>;
}
