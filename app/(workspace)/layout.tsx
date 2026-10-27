import { Suspense, type ReactNode } from "react";
import WorkspaceLoading from "./loading";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<WorkspaceLoading />}>{children}</Suspense>;
}
