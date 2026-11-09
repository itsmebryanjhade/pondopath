import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline | PondoPath", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="offline-page">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/pwa/icon-192.png" alt="" width={72} height={72} />
      <h1>You&apos;re offline</h1>
      <p>PondoPath needs a connection to show your latest cash plan, so nothing is shown from memory. Reconnect and try again.</p>
      <a className="offline-retry" href="/overview">Try again</a>
    </main>
  );
}
