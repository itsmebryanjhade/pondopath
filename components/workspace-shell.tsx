import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { RefreshRecords } from "./refresh-records";

export function WorkspaceShell({
  workspace,
  children,
  header,
}: {
  workspace: WorkspaceSnapshot;
  children: ReactNode;
  header?: ReactNode;
}) {
  return (
    <div className="page-enter">
        {header ?? <div className="workspace-stamp">
          <div>
            <p className="workspace-date">
              <span className="workspace-context">{workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</span>
              Cash plan as of <strong>{workspace.forecastInput.referenceDate}</strong>
            </p>
            <p className="muted">
              Opening cutoff {workspace.business.opening_date} · Asia/Manila · Revision{" "}
              {workspace.revision}
            </p>
          </div>
          <RefreshRecords />
        </div>}
        {children}
        <footer className="workspace-footer">
          Records loaded{" "}
          {new Date().toLocaleString("en-PH", {
            timeZone: "Asia/Manila",
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          (Asia/Manila) · Revision {workspace.revision} · Opening cutoff {workspace.business.opening_date}. Forecasts reflect entered records and reviewed assumptions; expected
          receipts are not available cash.
        </footer>
    </div>
  );
}
