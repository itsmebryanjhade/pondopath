"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSelectedIntakeAction } from "@/app/(workspace)/imports/actions";
import { parseIntakeCandidate, type IntakeCandidate } from "@/lib/domain/intake";
import { formatPHP } from "@/lib/domain/money";
import type { confirmSelectedIntake, IntakeItem } from "@/lib/server/intake";

type BulkResult = Awaited<ReturnType<typeof confirmSelectedIntake>>;

export function IntakeBulkResult({ result, items }: { result: BulkResult; items: IntakeItem[] }) {
  return <div role="status"><p>{result.confirmed.length} confirmed, {result.failed.length} need attention</p>
    {result.failed.length > 0 && <ul>{result.failed.map(failure => <li key={failure.id}>Source row {items.find(item => item.id === failure.id)?.external_id ?? "unavailable"}: {failure.code === "STALE_VERSION" ? "Changed since you opened the inbox — refresh and review it" : "Needs review on its own"}</li>)}</ul>}
  </div>;
}

/** What the person is confirming, so rows with the same source ID from different files can be told apart. */
function describe(item: IntakeItem, candidate: IntakeCandidate, sourceLabels: Record<string, string>) {
  const title = candidate.type === "save_invoice" ? `Invoice ${candidate.payload.number}` : `Expense ${candidate.payload.label}`;
  return `${title} · ${formatPHP(candidate.payload.amountCents)} · due ${candidate.payload.dueDate} · Source row ${item.external_id} · ${sourceLabels[item.source_id] ?? "Source unavailable"}`;
}

/** Same type, name, amount and due date means the same obligation, even when it came from another file. */
const lookalikeKey = (candidate: IntakeCandidate) =>
  [candidate.type, (candidate.type === "save_invoice" ? candidate.payload.number : candidate.payload.label).trim().toLowerCase(), candidate.payload.amountCents, candidate.payload.dueDate].join("|");

export function IntakeBulkConfirm({ items, revision, sourceLabels = {} }: { items: IntakeItem[]; revision: number; sourceLabels?: Record<string, string> }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [selection, setSelection] = useState<string[]>([]);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [notice, setNotice] = useState("");
  // Keep this check local: the equivalent server helper belongs to a server-only module.
  const parsed = items.flatMap(item => {
    if (item.status !== "pending") return [];
    try { const candidate = parseIntakeCandidate(item.candidate); return [{ ...item, summary: describe(item, candidate, sourceLabels), key: lookalikeKey(candidate) }]; } catch { return []; }
  });
  const seen = new Map<string, number>();
  parsed.forEach(row => seen.set(row.key, (seen.get(row.key) ?? 0) + 1));
  const clean = parsed.filter(row => seen.get(row.key) === 1);
  const lookalikes = parsed.filter(row => (seen.get(row.key) ?? 0) > 1);
  const selected = clean.filter(item => selection.includes(item.id));
  return <section className="records-panel" aria-label="Confirm selected proposals"><div className="intake-panel-body">
    <h2>Confirm selected</h2><p>Review the proposals below, then select the clean rows you want to apply. This does not record a payment.</p>
    <form onSubmit={event => {
      event.preventDefault(); setNotice(""); setResult(null);
      start(async () => {
        const response = await confirmSelectedIntakeAction({ items: selected.map(item => ({ id: item.id, reviewVersion: item.review_version })), revision });
        if (response.ok) { setResult(response.data); setSelection([]); } else setNotice(response.message);
        router.refresh();
      });
    }}>
      {clean.map(item => <label className="intake-confirm" key={item.id}><input type="checkbox" disabled={busy} checked={selection.includes(item.id)} onChange={event => setSelection(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />{item.summary}</label>)}
      {lookalikes.map(item => <p className="muted" key={item.id}>{item.summary} — Looks like another pending row, so review it on its own.</p>)}
      <div className="intake-buttons"><button type="button" className="button secondary" disabled={busy} onClick={() => setSelection(clean.map(item => item.id))}>Select all clean</button><button className="button" disabled={busy || selected.length === 0}>Confirm selected ({selected.length})</button></div>
    </form>
    {result && <IntakeBulkResult result={result} items={items} />}
    {notice && <p role="status">{notice}</p>}
  </div></section>;
}
