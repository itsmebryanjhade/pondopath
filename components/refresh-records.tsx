"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "./app-icon";

/** Reloads the workspace's records. `compact` is the icon-only version in the top bar; the full one is hidden on desktop, where the top bar has it. */
export function RefreshRecords({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const label = pending ? "Refreshing…" : "Refresh records";
  return (
    <button
      type="button"
      className={compact ? `icon-button topbar-refresh${pending ? " is-pending" : ""}` : "button secondary heading-refresh"}
      disabled={pending}
      aria-label={compact ? label : undefined}
      data-tip={compact ? label : undefined}
      onClick={() => startTransition(() => router.refresh())}
    >
      <AppIcon name="refresh-cw" />
      {!compact && label}
    </button>
  );
}
