import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { formatPlanDate } from "@/lib/display";
import { DashboardIcon } from "./dashboard-icon";
import { RefreshRecords } from "./refresh-records";

export function WorkspacePageHeading({ title, description, workspace, actions }: { title: string; description: string; workspace: WorkspaceSnapshot; actions?: ReactNode }) {
  return <header className="dashboard-heading page-heading">
    <div><p className="dashboard-eyebrow">{workspace.business.is_demo ? "Fictional demo" : workspace.business.name} · Asia/Manila</p><h1>{title}</h1><p>{description}</p></div>
    <div className="dashboard-heading-actions"><span className="dashboard-date"><DashboardIcon name="calendar" size={17} />{formatPlanDate(workspace.forecastInput.referenceDate)} · PHT</span><RefreshRecords />{actions}</div>
  </header>;
}
