"use client";

import type { ReactNode } from "react";
import type { AssistantContextEntry } from "@/lib/ui/assistant-chat-adapter";

export const ASSISTANT_OPEN_EVENT = "pondopath:open-assistant";

function openAssistant(entry: AssistantContextEntry, trigger: HTMLButtonElement) {
  trigger.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT, { detail: entry, bubbles: true }));
}

export function AiContextButton({ entry, children }: { entry: AssistantContextEntry; children: ReactNode }) {
  return (
    <button type="button" className="row-action" aria-haspopup="dialog"
      style={{ minHeight: 44, position: "relative", zIndex: 1 }}
      onClick={event => openAssistant(entry, event.currentTarget)}>
      {children}
    </button>
  );
}
