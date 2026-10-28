import { Suspense } from "react";
import Link from "next/link";
import WorkspaceLoading from "../loading";
import { getCashMovements, getWorkspace } from "@/lib/server/workspace";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { CashMovements } from "@/components/cash-movements";

export default function PaymentsPage() { return <Suspense fallback={<WorkspaceLoading />}><PaymentsContent /></Suspense>; }

async function PaymentsContent() {
  const workspace = await getWorkspace();
  const [receipts, payments] = await Promise.all([getCashMovements("receipt", workspace.revision), getCashMovements("expense_payment", workspace.revision)]);
  return <WorkspaceShell workspace={workspace} header={<WorkspacePageHeading workspace={workspace} title="Payments" description="Verified cash movements and their retained correction history." actions={<Link className="button" href="/invoices?filter=unpaid">Record a receipt</Link>} />}>
    <p className="panel" style={{ marginBottom: 20 }}>Customer promises and pending reminders are excluded from this history. Record a receipt on its invoice or a payment on its expense only after verification.</p>
    <div className="two-column"><CashMovements workspace={workspace} movements={receipts} kind="receipt" /><CashMovements workspace={workspace} movements={payments} kind="expense_payment" /></div>
    <Link className="text-link" href="/expenses">Open expenses to record a verified outgoing payment →</Link>
  </WorkspaceShell>;
}
