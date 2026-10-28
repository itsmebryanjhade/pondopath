import { Suspense, type ReactNode } from "react";
import WorkspaceLoading from "./loading";
import { ProductBrand } from "@/components/product-brand";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { getWorkspace } from "@/lib/server/workspace";
import "../workspace.css";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="loading-workspace"><ProductBrand /><WorkspaceLoading /></main>}>
    <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
  </Suspense>;
}

async function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const workspace = await getWorkspace();
  return <WorkspaceFrame workspace={workspace}>{children}</WorkspaceFrame>;
}
