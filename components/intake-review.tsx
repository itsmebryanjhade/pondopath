"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { reviewIntakeAction } from "@/app/(workspace)/imports/actions";
import { parseIntakeCandidate, type IntakeCandidate } from "@/lib/domain/intake";
import { parseMoney, formatPHP } from "@/lib/domain/money";
import type { IntakeItem } from "@/lib/server/intake";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { Field, TextAreaField } from "./command-form";
import { formatPlanDate } from "@/lib/display";
import { InlineActions } from "./inline-actions";

/** Each status in plain words, with a tone for its chip. */
const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Waiting for you", tone: "warn" },
  needs_match: { label: "Possible duplicate", tone: "warn" },
  applied: { label: "Applied", tone: "ok" },
  rejected: { label: "Rejected", tone: "off" },
  superseded: { label: "Replaced by a newer version", tone: "off" },
};
const readableDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatPlanDate(value) : value;

/** The original row as label/value pairs when it is flat; anything nested stays as formatted text. */
function SourceRow({ value }: { value: unknown }) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length && entries.every(([, cell]) => cell === null || ["string", "number", "boolean"].includes(typeof cell))) {
      return <dl className="intake-source-row">{entries.map(([key, cell]) => <div key={key}><dt>{key}</dt><dd>{cell === null || cell === "" ? "—" : String(cell)}</dd></div>)}</dl>;
    }
  }
  return <pre className="intake-evidence">{JSON.stringify(value, null, 2)}</pre>;
}

export function IntakeReview({ item, sourceLabel, workspace }: { item: IntakeItem; sourceLabel: string; workspace: Pick<WorkspaceSnapshot, "revision" | "actor" | "customers" | "invoices" | "expenses" | "members"> }) {
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const candidate = parseIntakeCandidate(item.candidate, true);
  const invoice = candidate.type === "save_invoice";
  const payload = candidate.payload;
  const outcome = item.outcome && typeof item.outcome === "object" && !Array.isArray(item.outcome) ? item.outcome : null;
  const recordId = item.matched_record_id ?? (typeof outcome?.recordId === "string" ? outcome.recordId : null);
  const record = invoice ? workspace.invoices.find(row => row.id === recordId) : workspace.expenses.find(row => row.id === recordId);
  const stale = !!item.matched_record_id && record?.version !== item.matched_version;
  const open = ["pending", "needs_match"].includes(item.status);
  const title = candidate.type === "save_invoice" ? candidate.payload.number : candidate.payload.label;
  const status = STATUS[item.status] ?? { label: item.status.replaceAll("_", " "), tone: "off" };
  const customerName = (id: string | undefined) => workspace.customers.find(row => row.id === id)?.name ?? "Unknown customer";
  const rows: { label: string; saved: string; proposed: string; changed: boolean }[] = [
    ...(candidate.type === "save_invoice"
      ? [
          { label: "Invoice number", saved: record && "number" in record ? record.number : "—", proposed: candidate.payload.number },
          { label: "Customer", saved: record && "customer_id" in record ? customerName(record.customer_id) : "—", proposed: customerName(candidate.payload.customerId) },
        ]
      : [
          { label: "Expense", saved: record && "label" in record ? record.label : "—", proposed: candidate.payload.label },
          { label: "Payee", saved: record && "payee" in record ? String(record.payee ?? "—") : "—", proposed: candidate.payload.payee },
        ]),
    { label: "Amount", saved: record ? formatPHP(record.amount_cents) : "—", proposed: formatPHP(payload.amountCents) },
    { label: "Due date", saved: record ? readableDay(record.due_date) : "—", proposed: readableDay(payload.dueDate) },
  ].map(row => ({ ...row, changed: !!record && row.saved !== row.proposed }));
  const reviewer = workspace.members.find(member => member.user_id === item.reviewed_by)?.display_name ?? "Business member";
  return <section className="records-panel intake-item" id={`item-${item.id}`} aria-labelledby={`title-${item.id}`}>
    <div className="records-head intake-head"><div><h2 id={`title-${item.id}`}>{title}</h2><p><span className={`intake-status is-${status.tone}`}>{status.label}</span><span>{invoice ? "Invoice" : "Expense"} from {sourceLabel} · row {item.external_id}</span></p></div><strong className="num">{formatPHP(payload.amountCents)}</strong></div>
    <div className="intake-panel-body">
      {open && (record || item.matched_record_id) ? (
        <table className="intake-diff">
          <caption className="sr-only">Saved {invoice ? "invoice" : "expense"} compared with the imported values</caption>
          <thead><tr><th scope="col"><span className="sr-only">Field</span></th><th scope="col">Saved now</th><th scope="col">From the import</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.label} className={row.changed ? "is-changed" : undefined}><th scope="row">{row.label}</th><td>{row.saved}</td><td>{row.proposed}{row.changed && <span className="sr-only"> (changed)</span>}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="intake-new">
          <p className="intake-new-title">{open ? `New ${invoice ? "invoice" : "expense"}. Nothing is saved until you confirm.` : "What was imported"}</p>
          <dl>{rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.proposed}</dd></div>)}</dl>
        </div>
      )}
      {open && item.matched_record_id && !record && <p className="intake-action-blocked">The matching saved record is no longer available.</p>}
      {stale && <p role="alert" className="form-error">The saved record changed after this was imported. Check the latest values before confirming.</p>}
      {item.review_note && <p className="intake-note"><span>Note from {reviewer}:</span> {item.review_note}</p>}
      <details className="intake-source"><summary>See the original row</summary>
        <p className="muted">Received {new Date(item.observed_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</p>
        <SourceRow value={item.source_evidence ?? item.original_content} />
        <details className="intake-source-tech"><summary>Technical details</summary><p className="muted">Source version {item.source_version} · Review version {item.review_version}</p><pre className="intake-evidence">{JSON.stringify(item.original_content, null, 2)}</pre></details>
      </details>
      {open ? (() => {
        type Decision = "apply" | "edit" | "clarify" | "reject";
        // One submit path for every decision. A note is required for anything but applying.
        const send = (decision: Decision, form: HTMLFormElement) => {
          const data = new FormData(form);
          const note = String(data.get("note") ?? "").trim();
          if (decision !== "apply" && !note) { setNotice("Add a short note first."); return; }
          let edited: IntakeCandidate | undefined;
          try {
            if (decision === "edit") {
              const id = item.matched_record_id || String(data.get("recordId") ?? "");
              const common = { ...(id ? { id } : {}), amountCents: parseMoney(String(data.get("amount") ?? "")), dueDate: String(data.get("dueDate")), reason: note };
              edited = parseIntakeCandidate(invoice ? { type: "save_invoice", payload: { ...common, number: String(data.get("number")), customerId: String(data.get("customerId")) } } : { type: "save_expense", payload: { ...common, label: String(data.get("label")), payee: String(data.get("payee")) } }, true);
            }
          } catch (error) { setNotice(error instanceof Error ? error.message : "Check the values."); return; }
          setNotice("");
          start(async () => {
            const result = await reviewIntakeAction({ id: item.id, reviewVersion: item.review_version, revision: workspace.revision, decision, ...(edited ? { candidate: edited } : {}), note, confirmed: data.get("confirmed") === "on" });
            if (result.ok) { setNotice(result.data.message); setDirty(false); } else setNotice(result.message);
          });
        };
        const onSubmit = (decision: Decision) => (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); send(decision, event.currentTarget); };
        const needsMatch = item.status === "needs_match";
        const blocked = stale ? "The saved record changed. Use Edit to review the latest values and save first."
          : needsMatch ? "Use Edit to choose the matching record and save first."
          : dirty ? "Save your edits first." : "";
        const kind = invoice ? "invoice" : "expense";
        return <InlineActions defaultActive={needsMatch || stale ? "edit" : null} actions={[
          {
            key: "apply", label: "Confirm", tone: "main", content: (
              <form className="intake-action-form" onSubmit={onSubmit("apply")}>
                <p className="intake-action-lead">{record ? `This updates ${kind} ${title} to ${formatPHP(payload.amountCents)}, due ${readableDay(payload.dueDate)}.` : `This adds a new ${kind}, ${title}, for ${formatPHP(payload.amountCents)}, due ${readableDay(payload.dueDate)}.`} It doesn&rsquo;t record any cash.</p>
                {blocked ? <p className="intake-action-blocked">{blocked}</p> : <>
                  <label className="intake-confirm"><input name="confirmed" type="checkbox" required /> I checked these values against the source.</label>
                  <div className="intake-buttons"><button className="button" disabled={busy}>Apply</button></div>
                </>}
              </form>
            ),
          },
          {
            key: "edit", label: needsMatch ? "Match or edit" : "Edit", content: (
              <form className="intake-action-form" onChange={() => setDirty(true)} onSubmit={onSubmit("edit")}>
                <div className="intake-form-grid">
                  {!item.matched_record_id && <label className="form-field"><span>Same as an existing {kind}?</span><select className="field" name="recordId" defaultValue=""><option value="">No, add it as new</option>{(invoice ? workspace.invoices : workspace.expenses).map(row => <option key={row.id} value={row.id}>{"number" in row ? row.number : row.label} · {formatPHP(row.amount_cents)} · {row.due_date}</option>)}</select></label>}
                  {candidate.type === "save_invoice" ? <><Field label="Invoice number" name="number" defaultValue={candidate.payload.number} required maxLength={100} /><label className="form-field"><span>Customer</span><select className="field" name="customerId" defaultValue={candidate.payload.customerId} required>{workspace.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label></> : <><Field label="Expense label" name="label" defaultValue={candidate.payload.label} required maxLength={200} /><Field label="Payee / supplier" name="payee" defaultValue={candidate.payload.payee} required maxLength={200} /></>}
                  <Field label="Total amount (PHP)" name="amount" defaultValue={(payload.amountCents / 100).toFixed(2)} inputMode="decimal" required /><Field label="Due date" name="dueDate" type="date" defaultValue={payload.dueDate} required />
                </div>
                <TextAreaField label="What did you change?" name="note" rows={2} maxLength={4000} required />
                <p className="muted">Records with payments keep the owner-only correction rules.</p>
                <div className="intake-buttons"><button className="button" disabled={busy}>Save changes</button></div>
              </form>
            ),
          },
          {
            key: "clarify", label: "Ask a question", content: (
              <form className="intake-action-form" onSubmit={onSubmit("clarify")}>
                <TextAreaField label="What needs checking?" name="note" rows={2} maxLength={4000} required placeholder="For example: the amount doesn't match the PDF." />
                <div className="intake-buttons"><button className="button" disabled={busy}>Mark as needs checking</button></div>
              </form>
            ),
          },
          {
            key: "reject", label: "Reject", content: (
              <form className="intake-action-form" onSubmit={onSubmit("reject")}>
                <TextAreaField label="Why reject it?" name="note" rows={2} maxLength={4000} required placeholder="For example: duplicate of an invoice already saved." />
                <p className="muted">Nothing is saved to your records.</p>
                <div className="intake-buttons"><button className="button intake-reject" disabled={busy}>Reject proposal</button></div>
              </form>
            ),
          },
        ]} />;
      })() : <p className="intake-resolved">{item.status === "applied" ? `Applied${item.reviewed_at ? ` on ${new Date(item.reviewed_at).toLocaleDateString("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric" })}` : ""} by ${reviewer}.` : item.status === "rejected" ? `Rejected by ${reviewer}. Nothing was saved.` : "A newer version of this row replaced it."} {invoice && typeof outcome?.recordId === "string" && <Link className="text-link" href={`/invoices/${outcome.recordId}?from=review`}>Open the invoice</Link>}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </section>;
}
