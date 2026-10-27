"use client";

import { useActionState, useState } from "react";
import { inviteTeammate } from "./actions";

export function InvitationForm() {
  const [result, action, pending] = useActionState(inviteTeammate, null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  return (
    <div className="grid gap-5 mt-6">
      <form action={action} className="grid gap-5" aria-busy={pending} onSubmit={() => setCopyStatus("")}>
        <div className="grid gap-2"><label htmlFor="name">Teammate name</label><input id="name" name="name" className="field" autoComplete="name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="grid gap-2"><label htmlFor="invite-email">Work email</label><input id="invite-email" name="email" className="field" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <p className="muted">Teammates receive finance staff access. Only the owner can approve owner-only actions or invite others.</p>
        {result?.error && !pending && <p role="alert" className="text-red-800">{result.error}</p>}
        <button className="button" disabled={pending}>{pending ? "Creating invitation…" : "Create private invitation"}</button>
      </form>
      {result?.link && !pending && (
        <section className="grid gap-3" aria-label="Your private invitation">
          <p role="status">Invitation ready for {result.email}.</p>
          <label htmlFor="private-link">Private sign-up link</label>
          <textarea id="private-link" className="field" rows={4} readOnly value={result.link} onFocus={(event) => event.target.select()} />
          <p className="muted">Share this link privately with this person only. Anyone with it can activate their account. It expires according to your workspace’s invitation settings. No email has been sent.</p>
          <button className="button secondary" type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(result.link!); setCopyStatus("Invitation link copied."); }
            catch { setCopyStatus("Select the link above and copy it manually."); }
          }}>Copy invitation link</button>
          <p role="status">{copyStatus}</p>
        </section>
      )}
    </div>
  );
}
