import { Suspense } from "react";
import { getWorkspace } from "@/lib/server/workspace";
import { formatPHP } from "@/lib/domain/money";
import { signOut } from "@/app/login/actions";

async function WorkspaceStatus() {
  const workspace = await getWorkspace();
  return (
    <main data-ui className="mx-auto w-full max-w-5xl px-6 py-10">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <p className="font-semibold">SoloForge <span className="font-normal text-neutral-600">/ Cash flow</span></p>
        <form action={signOut}><button className="button secondary">Sign out</button></form>
      </header>
      <h1 className="text-3xl font-semibold tracking-tight">{workspace.business.name}</h1>
      <p className="mt-3 text-neutral-600">Signed in as {workspace.actor.role === "owner" ? "Owner" : "Finance staff"}.</p>
      {workspace.business.is_demo && <p className="mt-6 border-l-2 border-neutral-400 pl-4 text-sm">Fictional demo · Financial reference date: {workspace.forecastInput.referenceDate} (Asia/Manila).</p>}
      <section className="mt-12 border-t border-neutral-200 py-6" aria-labelledby="cash-heading">
        <h2 id="cash-heading" className="text-sm text-neutral-600">Recorded available cash</h2>
        <p className="mt-2 text-4xl tabular-nums">{formatPHP(workspace.forecastInput.availableCents)}</p>
        <p className="mt-4 text-sm text-neutral-600">Calculated from the opening cash and recorded payments through the reference date.</p>
      </section>
    </main>
  );
}

export default function Overview() {
  return <Suspense fallback={<p role="status" className="p-8">Loading your workspace…</p>}><WorkspaceStatus /></Suspense>;
}
