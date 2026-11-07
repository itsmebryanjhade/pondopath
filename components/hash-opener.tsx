"use client";

import { useEffect } from "react";

/** Opens the closed <details> that holds a #day-… target, so "See what's due by …" lands on the right row. */
export function HashOpener({ prefix }: { prefix: string }) {
  useEffect(() => {
    const open = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash.startsWith(prefix)) return;
      const target = document.getElementById(hash);
      if (!target) return;
      const details = target.closest("details");
      if (details) details.open = true;
      target.scrollIntoView({ block: "center" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [prefix]);
  return null;
}
