"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

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
      {pending ? "Refreshing…" : "Refresh records"}
    </button>
  );
}
