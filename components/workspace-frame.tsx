import { DM_Sans, Manrope } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { signOut } from "@/app/login/actions";
import { ProductBrand } from "./product-brand";
import { AppIcon } from "./app-icon";
import { WorkspaceInvitationLink, WorkspaceNavigation } from "./workspace-navigation";
import { WorkspaceTools } from "./workspace-tools";
import { buildActivityRows } from "@/lib/ui/cash-overview";

const font = DM_Sans({ subsets: ["latin"], display: "swap" });
const headingFont = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-workspace-heading" });

export function WorkspaceFrame({ workspace, children }: {
  workspace: WorkspaceSnapshot;
  children: ReactNode;
}) {
  const role = workspace.actor.role === "owner" ? "Owner" : "Finance staff";
  const rows = buildActivityRows(workspace);
  const reviewCount = rows.filter((row) => row.needsAttention).length;
  const name = workspace.members.find((row) => row.user_id === workspace.actor.userId)?.display_name || role;
  const accountActions = <>
    {workspace.actor.role === "owner" && <WorkspaceInvitationLink />}
    <form action={signOut}><button className="account-action"><AppIcon name="log-out" />Sign out</button></form>
  </>;
  return (
    <div data-ui className={`${font.className} ${headingFont.variable} workspace-root`}>
      <a className="skip-link" href="#workspace-main">Skip to cash plan</a>
      <WorkspaceTools rows={rows} name={name} role={role} accountActions={accountActions} />
      <div className="workspace">
      <aside className="workspace-sidebar side-nav">
        <div className="workspace-side-brand side-brand"><ProductBrand /></div>
        <p className="workspace-nav-label">Workspace</p>
        <WorkspaceNavigation />
        <div className="workspace-insight side-insight"><strong>Forecast check</strong><p>{reviewCount ? `${reviewCount} unpaid ${reviewCount === 1 ? "record needs" : "records need"} review.` : "Review inputs when payments change."}</p><Link href="/forecast">Review inputs →</Link></div>
        <div className="workspace-business"><p>{workspace.business.name}</p><span>{role}</span></div>
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
    </div>
  );
}
