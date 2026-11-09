"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import type { AssistantContextEntry } from "@/lib/ui/assistant-chat-adapter";
import { ASSISTANT_OPEN_EVENT } from "./ai-context-button";
import { AssistantIcon } from "./assistant-icon";

const Dialog = lazy(() => import("./ai-assistant").then(module => ({ default: module.AiAssistant })));

export function AiAssistantLauncher({ workspace }: { workspace: WorkspaceSnapshot }) {
  return <AssistantSession key={workspace.business.id + ":" + workspace.actor.userId + ":" + workspace.actor.role}
    workspace={workspace} />;
}

function AssistantSession({ workspace }: { workspace: WorkspaceSnapshot }) {
  const [loaded, setLoaded] = useState(false);
  const [initialEntry, setInitialEntry] = useState<AssistantContextEntry>();
  const launcher = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const prepareEntry = useRef<(entry?: AssistantContextEntry) => void>(null);

  const open = useCallback((trigger: HTMLButtonElement, entry?: AssistantContextEntry) => {
    opener.current = trigger;
    if (prepareEntry.current) prepareEntry.current(entry);
    else setInitialEntry(entry);
    if (!dialog.current) setLoaded(true);
    else if (!dialog.current.open) dialog.current.showModal();
  }, []);

  useEffect(() => {
    function openFromCard(event: Event) {
      if (!(event instanceof CustomEvent) || !(event.target instanceof HTMLButtonElement)) return;
      const entry = event.detail as AssistantContextEntry | undefined;
      if (entry?.context && entry.workspace?.business && entry.workspace.actor && typeof entry.starterText === "string") {
        open(event.target, entry);
      }
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, openFromCard);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, openFromCard);
  }, [open]);

  return (
    <>
      <button ref={launcher} type="button" className="assistant-launch" aria-haspopup="dialog" aria-label="Open AI assistant"
        onClick={event => open(event.currentTarget)}>
        <AssistantIcon size={19} />
        AI assistant
      </button>
      {loaded && (
        <Suspense fallback={<span role="status" className="sr-only">Opening assistant…</span>}>
          <Dialog workspace={workspace} dialog={dialog} initialEntry={initialEntry} prepareEntryRef={prepareEntry}
            onClose={() => (opener.current?.isConnected ? opener.current : launcher.current)?.focus()} />
        </Suspense>
      )}
    </>
  );
}
