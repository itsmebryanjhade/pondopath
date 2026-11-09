"use client";

import { useEffect, useRef, useState } from "react";

// Reveals a new assistant reply like typing. Finished or older replies render in full at once.
export function TypedText({ text, animate, onDone, className }: {
  text: string; animate: boolean; onDone: () => void; className?: string;
}) {
  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [count, setCount] = useState(() => (animate && !reduced() ? 0 : text.length));
  const node = useRef<HTMLParagraphElement>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });

  useEffect(() => {
    if (!animate) return;
    if (reduced()) {
      done.current();
      return;
    }
    // About two seconds at most, however long the reply is.
    const step = Math.max(2, Math.ceil(text.length / 100));
    let shown = 0;
    const timer = window.setInterval(() => {
      shown = Math.min(text.length, shown + step);
      setCount(shown);
      node.current?.scrollIntoView({ block: "nearest" });
      if (shown >= text.length) {
        window.clearInterval(timer);
        done.current();
      }
    }, 20);
    return () => window.clearInterval(timer);
  }, [animate, text]);

  const typing = animate && count < text.length;
  return (
    <p ref={node} className={className} aria-label={typing ? undefined : text}>
      <span aria-hidden={typing || undefined}>{text.slice(0, count)}</span>
      {typing && <span className="assistant-caret" aria-hidden="true" />}
    </p>
  );
}
