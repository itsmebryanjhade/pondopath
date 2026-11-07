import { DM_Sans, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { signOut } from "@/app/login/actions";
import { ProductBrand } from "./product-brand";
import { AppIcon } from "./app-icon";
import { WorkspaceInvitationLink, WorkspaceNavigation } from "./workspace-navigation";
import { WorkspaceTools } from "./workspace-tools";
import { buildActivityRows } from "@/lib/ui/cash-overview";
import { AiAssistant } from "./ai-assistant";
import { FileDropOverlay } from "./file-drop-overlay";
import { MobileTabBar } from "./mobile-tab-bar";
import { SidebarToggle } from "./sidebar-toggle";
import { ToastHost } from "./toast-host";

const font = DM_Sans({ subsets: ["latin"], display: "swap" });
const headingFont = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-workspace-heading" });

export function WorkspaceFrame({ workspace, children }: {
  workspace: WorkspaceSnapshot;
  children: ReactNode;
}) {
  const role = workspace.actor.role === "owner" ? "Owner" : "Finance staff";
  const rows = buildActivityRows(workspace);
  const followupCount = workspace.followups.filter((task) => task.state === "open").length;
  const inboxCount = workspace.intakeReviews?.length ?? 0;
  const name = workspace.members.find((row) => row.user_id === workspace.actor.userId)?.display_name || role;
  const accountActions = <>
    {workspace.actor.role === "owner" && <WorkspaceInvitationLink />}
    <form action={signOut}><button className="account-action"><AppIcon name="log-out" />Sign out</button></form>
  </>;
  return (
    <ToastHost>
    <FileDropOverlay />
    <div data-ui className={`${font.className} ${headingFont.variable} workspace-root app-shell`}>
      <a className="skip-link" href="#workspace-main">Skip to cash plan</a>
      <WorkspaceTools rows={rows} name={name} role={role} businessName={workspace.business.name} accountActions={accountActions} brand={<ProductBrand />} />
      <div className="workspace">
      <aside id="workspace-sidebar" className="side-nav" aria-label="Workspace navigation">
        <div className="side-brand"><ProductBrand /><SidebarToggle /></div>
        <WorkspaceNavigation followupCount={followupCount} inboxCount={inboxCount} />
      </aside>
      <main id="workspace-main" tabIndex={-1} className="workspace-content">{children}</main>
      </div>
      <MobileTabBar followupCount={followupCount} inboxCount={inboxCount} />
      <AiAssistant workspace={workspace} />
    </div>
    </ToastHost>
  );
}
