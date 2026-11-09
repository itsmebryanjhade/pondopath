import type { SideIcon } from "@/lib/ui/sidebar";
import { DashboardIcon } from "./dashboard-icon";

const DRAWN: Record<"inbox" | "message", React.ReactNode> = {
  inbox: <><path d="M4 13l2-7a2 2 0 0 1 2-1.5h8a2 2 0 0 1 2 1.5l2 7" /><path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4h-5a3 3 0 0 1-6 0z" /></>,
  message: <><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8 9.5h8M8 12.5h5" /></>,
};

/** Sidebar icon: shared dashboard icons where they fit, plus two drawn in the same outline style. */
export function SideIconGlyph({ name, size = 18 }: { name: SideIcon; size?: number }) {
  if (name === "inbox" || name === "message") {
    return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{DRAWN[name]}</svg>;
  }
  return <DashboardIcon name={name} size={size} />;
}
