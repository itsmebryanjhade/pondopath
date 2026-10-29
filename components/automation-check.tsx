"use client";
import { useState, useTransition } from "react";
import { checkMissedCommitments } from "@/app/(workspace)/actions";

export function AutomationCheck() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <div className="automation-check">
    <button className="followup-source-link" type="button" disabled={pending} onClick={() => startTransition(async () => {
      setMessage("");
      try {
        const result = await checkMissedCommitments();
        setMessage(result.ok ? `Check complete: ${result.data.created} new, ${result.data.existing} already tracked, ${result.data.skipped} no longer actionable. No payments or messages were sent.` : result.message);
      } catch { setMessage("The check could not be confirmed. Try again; duplicate tasks will not be created."); }
    })}>{pending ? "Checking…" : "Check now"}</button>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
