"use client";

import { lazy, Suspense, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { DashboardIcon } from "./dashboard-icon";

const Dialog = lazy(() => import("./ai-assistant").then(module => ({ default: module.AiAssistant })));

export function AiAssistantLauncher({ workspace }: { workspace: WorkspaceSnapshot }) {
  return <AssistantSession key={workspace.business.id + ":" + workspace.actor.userId + ":" + workspace.actor.role}
    workspace={workspace} />;
}

function AssistantSession({ workspace }: { workspace: WorkspaceSnapshot }) {
  const [loaded, setLoaded] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button ref={launcher} type="button" className="assistant-launch" aria-haspopup="dialog" aria-label="Open AI assistant"
        onClick={() => {
          if (dialog.current) {
            if (!dialog.current.open) dialog.current.showModal();
          } else setLoaded(true);
        }}>
        <DashboardIcon name="sparkle" size={18} />
        AI assistant
      </button>
      {loaded && (
        <Suspense fallback={<span role="status" className="sr-only">Opening assistant…</span>}>
          <Dialog workspace={workspace} dialog={dialog} onClose={() => launcher.current?.focus()} />
        </Suspense>
      )}
    </>
  );
}
