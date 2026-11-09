"use client";

import type { ReactNode } from "react";
import type { AssistantContextEntry } from "@/lib/ui/assistant-chat-adapter";
import { DashboardIcon } from "./dashboard-icon";

export const ASSISTANT_OPEN_EVENT = "pondopath:open-assistant";

function openAssistant(entry: AssistantContextEntry, trigger: HTMLButtonElement) {
  trigger.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT, { detail: entry, bubbles: true }));
}

export function AiContextButton({ entry, children, tone = "default" }: {
  entry: AssistantContextEntry;
  children: ReactNode;
  tone?: "default" | "inverse";
}) {
  return (
    <button type="button" className={tone === "inverse" ? "ask-ai is-inverse" : "ask-ai"} aria-haspopup="dialog"
      onClick={event => openAssistant(entry, event.currentTarget)}>
      <span className="ask-ai-mark" aria-hidden="true"><DashboardIcon name="sparkle" size={14} />AI</span>
      <span className="ask-ai-label">{children}</span>
      <span className="ask-ai-arrow" aria-hidden="true"><DashboardIcon name="arrowRight" size={14} /></span>
    </button>
  );
}
