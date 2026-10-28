"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "./app-icon";

export function RefreshRecords() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="button secondary"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      <AppIcon name="refresh-cw" />
      {pending ? "Refreshing…" : "Refresh records"}
    </button>
  );
}
