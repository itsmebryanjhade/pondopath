import Link from "next/link";
import { getWorkspace } from "@/lib/server/workspace";
import { calculateForecast } from "@/lib/domain/forecast";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspacePageHeading } from "@/components/workspace-page-heading";
import { CashForecast } from "@/components/cash-forecast";
import { ScenarioPanel } from "@/components/scenario-panel";

export default async function ForecastPage() {
  const workspace = await getWorkspace();
  const forecast = calculateForecast(workspace.forecastInput);
  return <WorkspaceShell workspace={workspace} header={<WorkspacePageHeading workspace={workspace} title="Cash forecast" description="Trace the next 30 days to entered receipts and obligations, then compare an unsaved scenario." />}>
    <dl className="view-metrics"><div className="panel"><dt>First projected shortage</dt><dd className="num">{forecast.firstShortage ? formatPHP(forecast.firstShortage.shortfallCents) : "None projected"}</dd>{forecast.firstShortage && <p>{formatPlanDate(forecast.firstShortage.date)}</p>}</div><div className="panel"><dt>Largest projected shortfall</dt><dd className="num">{formatPHP(forecast.maxShortfallCents)}</dd></div><div className="panel"><dt>Projected end balance</dt><dd className={`num${forecast.days[29].closingCents < 0 ? " negative" : ""}`}>{formatPHP(forecast.days[29].closingCents)}</dd></div></dl>
    <p className="panel" style={{ marginBottom: 20 }}>{forecast.incompleteInvoiceIds.length ? `Incomplete plan: ${forecast.incompleteInvoiceIds.length} unpaid invoices have unplanned amounts or no usable expected payment. ` : "This plan reflects entered records only. "}{forecast.staleExpectationIds.length} past expectations excluded; {forecast.overdueExpenseIds.length} overdue expenses treated as due now. <Link className="text-link" href="/invoices">Review inputs</Link>.</p>
    <CashForecast forecast={forecast} workspace={workspace} />
    <div style={{ marginTop: 20 }}><ScenarioPanel key={workspace.revision} workspace={workspace} /></div>
  </WorkspaceShell>;
}
