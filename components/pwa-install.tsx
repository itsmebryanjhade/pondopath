"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const DISMISSED = "pondopath-install-dismissed";
const WEEK = 7 * 24 * 60 * 60 * 1000;

function recentlyDismissed() {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISSED) ?? 0) < WEEK;
  } catch {
    return false;
  }
}

// Registers the service worker (production only) and offers a one-tap install.
export function PwaInstall() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone || recentlyDismissed()) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // iOS Safari has no install event; show the manual steps once.
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    const timer = ios ? window.setTimeout(() => setIosHint(true), 0) : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISSED, String(Date.now())); } catch { /* private mode */ }
    setInstallEvent(null);
    setIosHint(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "dismissed") dismiss();
    setInstallEvent(null);
  }

  if (!installEvent && !iosHint) return null;
  return (
    <div className="pwa-install" role="region" aria-label="Install PondoPath">
      <span className="pwa-install-text">
        {installEvent ? "Install PondoPath for quick access." : "Install: tap Share, then Add to Home Screen."}
      </span>
      {installEvent && <button type="button" className="pwa-install-btn" onClick={install}>Install app</button>}
      <button type="button" className="pwa-install-close" aria-label="Dismiss install suggestion" onClick={dismiss}>×</button>
    </div>
  );
}
