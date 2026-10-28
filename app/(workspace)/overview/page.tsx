import { Suspense } from "react";
import { headers } from "next/headers";
import WorkspaceLoading from "../loading";
import { getWorkspace } from "@/lib/server/workspace";
import { LOGIN_NOTICE_HEADER } from "@/lib/auth-notice";
import { AuthToast } from "@/components/auth-toast";
import { CashOverview } from "@/components/cash-overview";
import { OpeningCashForm } from "@/components/record-forms";
import { ScenarioPanel } from "@/components/scenario-panel";
import { AppIcon } from "@/components/app-icon";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";

export default function Overview() {
  return <Suspense fallback={<WorkspaceLoading />}><OverviewContent /></Suspense>;
}

async function OverviewContent() {
  const workspace = await getWorkspace();
  const showLoginToast = (await headers()).get(LOGIN_NOTICE_HEADER) === "signed-in";
  return <>
    {showLoginToast && <AuthToast kind="success" message="You’re signed in. Your business cash plan is ready." />}
    <CashOverview workspace={workspace} planningTools={<>
      <ScenarioPanel key={workspace.revision} workspace={workspace} />
      <details id="opening-cash" className="panel disclosure">
        <summary>
          <AppIcon name="book-open" /><span>Opening cash baseline</span><AppIcon name="chevron-down" />
        </summary>
        <p className="muted">Recorded opening cash: {formatPHP(workspace.business.opening_cash_cents)} on {formatPlanDate(workspace.business.opening_date)}.</p>
        {workspace.business.opening_locked_at ? (
          <p className="muted">
            Locked after the first actual movement. Correct a mistaken movement by voiding its
            retained entry; a baseline reset is outside this workspace.
          </p>
        ) : workspace.actor.role === "owner" ? (
          <OpeningCashForm workspace={workspace} />
        ) : (
          <p className="muted">Only the owner can set the opening cash baseline.</p>
        )}
      </details>
    </>} />
  </>;
}
