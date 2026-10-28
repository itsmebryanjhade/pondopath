import { getCashMovements, getWorkspace } from "@/lib/server/workspace";
import { CashPosition } from "@/components/cash-position";
import { OpeningCashForm } from "@/components/record-forms";

export default async function CashPage() {
  const workspace = await getWorkspace();
  const [receipts, payments] = await Promise.all([
    getCashMovements("receipt", workspace.revision),
    getCashMovements("expense_payment", workspace.revision),
  ]);
  return <CashPosition workspace={workspace} receipts={receipts} payments={payments}
    openingControls={<OpeningCashForm workspace={workspace} />} />;
}
