import { Suspense, type ReactNode } from "react";
import { WorkspaceSplash } from "@/components/workspace-loading";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { getWorkspace } from "@/lib/server/workspace";
import "../workspace.css";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <>
    <div className="first-paint-splash" aria-hidden="true"><WorkspaceSplash /></div>
    <Suspense fallback={<WorkspaceSplash />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  </>;
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const workspace = await getWorkspace();
  return <WorkspaceFrame workspace={workspace}>{children}</WorkspaceFrame>;
}
