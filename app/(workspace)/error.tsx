"use client";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-lg p-8"><h1 className="mb-4 text-2xl font-semibold">Workspace unavailable</h1><p role="alert" className="mb-6">We could not load the latest records. Please try again.</p><button className="button" onClick={reset}>Try again</button></main>;
}
