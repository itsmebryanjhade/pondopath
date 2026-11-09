"use client";

import { useId, useState, type ReactNode } from "react";

export type InlineAction = { key: string; label: string; ariaLabel?: string; tone?: "main" | "quiet"; content: ReactNode };

/**
 * A fixed row of buttons; the chosen one's form slides open below the row (grid-rows accordion).
 * Buttons never move when a form opens, and only one form is open at a time.
 * Forms stay mounted, so anything half-typed survives closing and switching.
 */
export function InlineActions({ actions, defaultActive = null, lead }: { actions: InlineAction[]; defaultActive?: string | null; lead?: ReactNode }) {
  const [active, setActive] = useState<string | null>(defaultActive);
  const id = useId();
  return (
    <div className="inline-actions">
      <div className="inline-actions-buttons">
        {lead && <div className="inline-actions-lead">{lead}</div>}
        {actions.map((action) => (
          <button key={action.key} type="button" className={`row-action is-${action.tone ?? "quiet"}`}
            aria-label={action.ariaLabel} aria-expanded={active === action.key} aria-controls={`${id}-${action.key}`}
            onClick={() => setActive(active === action.key ? null : action.key)}>
            {action.label}
          </button>
        ))}
      </div>
      {actions.map((action) => (
        <div key={action.key} id={`${id}-${action.key}`} className="inline-action-panel" data-open={active === action.key} inert={active !== action.key}>
          <div className="inline-action-inner">{action.content}</div>
        </div>
      ))}
    </div>
  );
}
