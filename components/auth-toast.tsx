"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function AuthToast({ kind, message }: { kind: "success" | "error"; message: string }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (kind !== "success") return;
    const timeout = window.setTimeout(() => setDismissed(true), 8_000);
    return () => window.clearTimeout(timeout);
  }, [kind]);

  if (dismissed) return null;
  return (
    <aside role={kind === "error" ? "alert" : "status"} aria-atomic="true" className="auth-toast">
      <Image src="/brand/pondopath-icon.png" alt="" width={28} height={28} className="mt-1 shrink-0" />
      <div className="min-w-0 flex-1 py-1">
        <p className="text-sm font-semibold">{kind === "success" ? "Welcome to PondoPath" : "PondoPath sign-in failed"}</p>
        <p className="mt-1 text-sm text-neutral-600">{message}</p>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss notification" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-neutral-100">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
      </button>
    </aside>
  );
}
