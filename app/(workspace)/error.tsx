"use client";

export default function WorkspaceError({ retry }: { retry: () => void }) {
  return <section className="panel mx-auto max-w-lg p-8"><h1 className="mb-4 text-2xl font-semibold">Workspace unavailable</h1><p role="alert" className="mb-6">We could not load the latest records. Please try again.</p><button className="button" onClick={retry}>Try again</button></section>;
}
