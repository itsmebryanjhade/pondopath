"use client";

import type { ReactNode } from "react";

/**
 * An in-page link that works on every click. A Next.js link to the hash you're already on does nothing,
 * so this scrolls to the target itself, opens it if it's a closed <details>, and moves focus there.
 */
export function JumpLink({ target, className, children, label }: { target: string; className?: string; children: ReactNode; label?: string }) {
  return (
    <a href={`#${target}`} className={className} aria-label={label} onClick={(event) => {
      const element = document.getElementById(target);
      if (!element) return;
      event.preventDefault();
      if (element instanceof HTMLDetailsElement) element.open = true;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      const focusable = element instanceof HTMLDetailsElement ? element.querySelector("summary") : element;
      if (focusable instanceof HTMLElement) {
        if (!focusable.matches("summary, a, button, [tabindex]")) focusable.setAttribute("tabindex", "-1");
        focusable.focus({ preventScroll: true });
      }
      history.replaceState(null, "", `#${target}`);
    }}>{children}</a>
  );
}
