import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { signOut } from "@/app/login/actions";
import { ProductBrand } from "./product-brand";
import { AppIcon } from "./app-icon";
import { WorkspaceInvitationLink, WorkspaceNavigation } from "./workspace-navigation";

const font = DM_Sans({ subsets: ["latin"], display: "swap" });

export function WorkspaceFrame({ workspace, children }: {
  workspace: WorkspaceSnapshot;
  children: ReactNode;
}) {
  const role = workspace.actor.role === "owner" ? "Owner" : "Finance staff";
  const accountActions = <>
    {workspace.actor.role === "owner" && <WorkspaceInvitationLink />}
    <form action={signOut}><button className="account-action"><AppIcon name="log-out" />Sign out</button></form>
  </>;
  return (
    <div data-ui className={`${font.className} workspace`}>
      <a className="skip-link" href="#workspace-main">Skip to cash plan</a>
      <aside className="workspace-sidebar">
        <ProductBrand />
        <WorkspaceNavigation />
        <div className="account-controls">
          <div className="workspace-business"><p>{workspace.business.name}</p><span>{role}</span></div>
          {accountActions}
        </div>
      </aside>
      <header className="mobile-header">
        <ProductBrand />
        <details>
          <summary>Menu</summary>
          <div className="mobile-menu">
            <p>{workspace.business.name} · {role}</p>
            <WorkspaceNavigation />
            {accountActions}
          </div>
        </details>
      </header>
      <main id="workspace-main" tabIndex={-1} className="workspace-main">{children}</main>
    </div>
  );
}
