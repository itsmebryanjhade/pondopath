"use client";

import { useState } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { OpeningCashForm } from "./record-forms";

/** The owner's Edit button for opening cash; the two-field form opens only when asked for and closes after saving. */
export function OpeningCashEditor({ workspace }: { workspace: WorkspaceSnapshot }) {
  const [editing, setEditing] = useState(false);
  if (!editing) return <button type="button" className="button secondary opening-edit" onClick={() => setEditing(true)}><span aria-hidden="true">&#9998;</span> Edit opening cash</button>;
  return <div className="opening-form"><OpeningCashForm workspace={workspace} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} /></div>;
}
