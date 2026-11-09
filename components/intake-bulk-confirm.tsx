"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSelectedIntakeAction } from "@/app/(workspace)/imports/actions";
import { parseIntakeCandidate, type IntakeCandidate } from "@/lib/domain/intake";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import type { confirmSelectedIntake, IntakeItem } from "@/lib/server/intake";

type BulkResult = Awaited<ReturnType<typeof confirmSelectedIntake>>;

export function IntakeBulkResult({ result, items }: { result: BulkResult; items: IntakeItem[] }) {
  return <div role="status"><p>{result.confirmed.length} confirmed, {result.failed.length} need attention</p>
    {result.failed.length > 0 && <ul>{result.failed.map(failure => <li key={failure.id}>Source row {items.find(item => item.id === failure.id)?.external_id ?? "unavailable"}: {failure.code === "STALE_VERSION" ? "Changed since you opened the inbox — refresh and review it" : "Needs review on its own"}</li>)}</ul>}
  </div>;
}

/** What the person is confirming, so rows with the same source ID from different files can be told apart. */
function describe(item: IntakeItem, candidate: IntakeCandidate, sourceLabels: Record<string, string>) {
  const invoice = candidate.type === "save_invoice";
  return {
    kind: invoice ? "Invoice" : "Expense",
    name: invoice ? candidate.payload.number : candidate.payload.label,
    amount: formatPHP(candidate.payload.amountCents),
    due: /^\d{4}-\d{2}-\d{2}$/.test(candidate.payload.dueDate) ? formatPlanDate(candidate.payload.dueDate) : candidate.payload.dueDate,
    source: `${sourceLabels[item.source_id] ?? "Source unavailable"} · row ${item.external_id}`,
  };
}
type Summary = ReturnType<typeof describe>;

/** One row: what it is, how much, when it is due, and where it came from. */
function Row({ summary }: { summary: Summary }) {
  return <span className="bulk-row">
    <span className="bulk-row-main"><span className="bulk-kind">{summary.kind}</span> <strong>{summary.name}</strong><small>Due {summary.due} · {summary.source}</small></span>
    <strong className="bulk-row-amount num">{summary.amount}</strong>
  </span>;
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
  const allSelected = clean.length > 0 && selected.length === clean.length;
  return <section className="records-panel bulk-confirm" aria-labelledby="bulk-confirm-heading"><div className="intake-panel-body">
    <h2 id="bulk-confirm-heading">Confirm several at once</h2>
    <p className="muted">Tick the ones you&rsquo;ve checked. They&rsquo;re added to your records; no cash is recorded.</p>
    <form onSubmit={event => {
      event.preventDefault(); setNotice(""); setResult(null);
      start(async () => {
        const response = await confirmSelectedIntakeAction({ items: selected.map(item => ({ id: item.id, reviewVersion: item.review_version })), revision });
        if (response.ok) { setResult(response.data); setSelection([]); } else setNotice(response.message);
        router.refresh();
      });
    }}>
      <ul className="bulk-list">
        {clean.map(item => <li key={item.id}><label className={`bulk-pick${selection.includes(item.id) ? " is-picked" : ""}`}><input type="checkbox" disabled={busy} checked={selection.includes(item.id)} onChange={event => setSelection(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /><Row summary={item.summary} /></label></li>)}
      </ul>
      {lookalikes.length > 0 && <div className="bulk-lookalikes">
        <p><strong>Check these on their own</strong> · they look the same as another row, so they can&rsquo;t be confirmed together.</p>
        <ul className="bulk-list">{lookalikes.map(item => <li key={item.id}><span className="bulk-pick is-off"><Row summary={item.summary} /></span><span className="sr-only">Looks like another pending row, so review it on its own.</span></li>)}</ul>
      </div>}
      <div className="intake-buttons">
        <button className="button" disabled={busy || selected.length === 0}>{selected.length ? `Confirm ${selected.length} selected` : "Confirm selected"}</button>
        {clean.length > 1 && <button type="button" className="row-action is-quiet" disabled={busy} onClick={() => setSelection(allSelected ? [] : clean.map(item => item.id))}>{allSelected ? "Clear selection" : `Select all ${clean.length}`}</button>}
      </div>
    </form>
    {result && <IntakeBulkResult result={result} items={items} />}
    {notice && <p role="status">{notice}</p>}
  </div></section>;
}
