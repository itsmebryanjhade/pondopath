"use client";

import WorkspaceError from "./(workspace)/error";

export default function PageError({ retry }: { retry: () => void }) {
  return <main className="loading-workspace"><WorkspaceError retry={retry} /></main>;
}
