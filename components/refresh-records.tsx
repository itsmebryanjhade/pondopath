"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "./app-icon";
import { DashboardIcon } from "./dashboard-icon";
import { useToast } from "./toast-host";

type Phase = "idle" | "pending" | "done" | "offline";
const MIN_SPIN_MS = 600, SHOW_RESULT_MS = 2500;
const clock = () => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date());

/**
 * Reloads the workspace's records and says so: the icon spins while it works (at least briefly, so a fast refresh
 * is still visible), then shows a check and a "Records refreshed" toast before settling back. Offline shows a warning instead.
 * `compact` is the icon-only version in the top bar; the full one is hidden on desktop, where the top bar has it.
 */
export function RefreshRecords({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("idle");
  const [last, setLast] = useState<string | null>(null);
  const started = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  // When the refresh finishes, keep spinning until the minimum time, then show the result for a moment.
  useEffect(() => {
    if (pending || phase !== "pending") return;
    later(Math.max(0, MIN_SPIN_MS - (Date.now() - started.current)), () => {
      const time = clock();
      setLast(time);
      setPhase("done");
      toast.show(`Records refreshed · ${time}`, undefined, "success", "refresh");
      later(SHOW_RESULT_MS, () => setPhase("idle"));
    });
  }, [pending, phase, toast]);

  function refresh() {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setPhase("offline");
      toast.show("You’re offline, so records weren’t refreshed.", undefined, "notice", "refresh");
      later(SHOW_RESULT_MS + 500, () => setPhase("idle"));
      return;
    }
    started.current = Date.now();
    setPhase("pending");
    startTransition(() => router.refresh());
  }

  const busy = pending || phase === "pending";
  const label = busy ? "Refreshing…"
    : phase === "done" ? `Up to date · ${last}`
    : phase === "offline" ? "You’re offline. Try again when connected."
    : last ? `Refresh records · last ${last}` : "Refresh records";
  const state = busy ? " is-pending" : phase === "done" ? " is-done" : phase === "offline" ? " is-offline" : "";
  return (
    <>
      <button
        type="button"
        className={compact ? `icon-button topbar-refresh${state}` : `button secondary heading-refresh${state}`}
        disabled={busy}
        aria-label={compact ? label : undefined}
        data-tip={compact ? label : undefined}
        onClick={refresh}
      >
        {phase === "done" && !busy ? <DashboardIcon name="check" size={17} /> : <AppIcon name="refresh-cw" />}
        {!compact && (busy ? "Refreshing…" : phase === "done" ? "Up to date" : phase === "offline" ? "You’re offline" : "Refresh records")}
      </button>
    </>
  );
}
