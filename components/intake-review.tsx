"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewIntakeAction } from "@/app/(workspace)/imports/actions";
import { parseIntakeCandidate, type IntakeCandidate } from "@/lib/domain/intake";
import { parseMoney, formatPHP } from "@/lib/domain/money";
import type { IntakeItem } from "@/lib/server/intake";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { Field, TextAreaField } from "./command-form";

export function IntakeReview({ item, sourceLabel, workspace }: { item: IntakeItem; sourceLabel: string; workspace: Pick<WorkspaceSnapshot, "revision" | "actor" | "customers" | "invoices" | "expenses" | "members"> }) {
  const router = useRouter();
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
  const reviewer = workspace.members.find(member => member.user_id === item.reviewed_by)?.display_name ?? "Business member";
  return <section className="records-panel intake-item" id={`item-${item.id}`} aria-labelledby={`title-${item.id}`}>
    <div className="records-head"><div><h2 id={`title-${item.id}`}>{title}</h2><p>{sourceLabel} · Source row {item.external_id} · {invoice ? "Invoice" : "Expense"} · {item.status.replaceAll("_", " ")}</p></div><strong>{formatPHP(payload.amountCents)}</strong></div>
    <div className="intake-panel-body">
      <div className="intake-comparison"><div><h3>Current saved record</h3>{record ? <p>{"number" in record ? record.number : record.label}<br />{formatPHP(record.amount_cents)} · Original due {record.due_date}<br />Record version {record.version}</p> : <p>{item.matched_record_id ? "The matched record is no longer available." : "New record proposed. No saved record has been changed."}</p>}</div><div><h3>Proposed values</h3><p>{title}<br />{formatPHP(payload.amountCents)} · Original due {payload.dueDate}<br />Review version {item.review_version}</p></div></div>
      {stale && <p role="alert" className="form-error">The saved record changed since this proposal was prepared. Review the latest values, enter a note, and save the reviewed proposal before confirming.</p>}
      {item.review_note && <p className="muted">Last review by {reviewer}: {item.review_note}</p>}
      <details><summary>Original source content and provenance</summary><p className="muted">Received {new Date(item.observed_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · Source version {item.source_version}</p><pre className="intake-evidence">{JSON.stringify(item.source_evidence ?? item.original_content, null, 2)}</pre><details><summary>Original normalized proposal</summary><pre className="intake-evidence">{JSON.stringify(item.original_content, null, 2)}</pre></details></details>
      {open ? <form key={`${item.id}:${item.review_version}`} onChange={() => setDirty(true)} onSubmit={event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "edit";
        const note = String(form.get("note") ?? "").trim();
        if (decision !== "apply" && !note) { setNotice("Enter a review note before saving, rejecting or asking for clarification."); return; }
        let edited: IntakeCandidate | undefined;
        try {
          const id = item.matched_record_id || String(form.get("recordId") ?? "");
          const common = { ...(id ? { id } : {}), amountCents: parseMoney(String(form.get("amount") ?? "")), dueDate: String(form.get("dueDate")), ...(note ? { reason: note } : {}) };
          if (decision === "edit") edited = parseIntakeCandidate(invoice ? { type: "save_invoice", payload: { ...common, number: String(form.get("number")), customerId: String(form.get("customerId")) } } : { type: "save_expense", payload: { ...common, label: String(form.get("label")), payee: String(form.get("payee")) } }, true);
        } catch (error) { setNotice(error instanceof Error ? error.message : "Check the proposal values."); return; }
        start(async () => { const result = await reviewIntakeAction({ id: item.id, reviewVersion: item.review_version, revision: workspace.revision, decision, ...(edited ? { candidate: edited } : {}), note, confirmed: form.get("confirmed") === "on" }); if (result.ok) { setNotice(result.data.message); setDirty(false); router.refresh(); } else setNotice(result.message); });
      }}>
        <details open={item.status === "needs_match"}><summary>Edit or match this proposal</summary>
          <div className="intake-form-grid">
            {!item.matched_record_id && <label className="form-field"><span>Match an existing {invoice ? "invoice" : "expense"}</span><select className="field" name="recordId" defaultValue=""><option value="">Create a new record (duplicate checks still apply)</option>{(invoice ? workspace.invoices : workspace.expenses).map(row => <option key={row.id} value={row.id}>{"number" in row ? row.number : row.label} · {formatPHP(row.amount_cents)} · {row.due_date}</option>)}</select><small>Choose the matching saved record to resolve a possible duplicate. Save the reviewed proposal first.</small></label>}
            {candidate.type === "save_invoice" ? <><Field label="Invoice number" name="number" defaultValue={candidate.payload.number} required maxLength={100} /><label className="form-field"><span>Customer</span><select className="field" name="customerId" defaultValue={candidate.payload.customerId} required>{workspace.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label></> : <><Field label="Expense label" name="label" defaultValue={candidate.payload.label} required maxLength={200} /><Field label="Payee / supplier" name="payee" defaultValue={candidate.payload.payee} required maxLength={200} /></>}
            <Field label="Total amount (PHP)" name="amount" defaultValue={(payload.amountCents / 100).toFixed(2)} inputMode="decimal" required /><Field label="Original due date" name="dueDate" type="date" defaultValue={payload.dueDate} required />
          </div>
        </details>
        <TextAreaField label="Review note (required for edits, rejection or clarification)" name="note" maxLength={4000} placeholder="What did you verify or what still needs clarification?" />
        <p className="muted">Changing a record with posted payments keeps the existing owner-only correction rules. A source row or payment promise never adds actual cash.</p>
        <label className="intake-confirm"><input name="confirmed" type="checkbox" onChange={event => event.stopPropagation()} /> I reviewed the current and proposed values and want to apply this proposal.</label>
        <div className="intake-buttons"><button className="button secondary" name="decision" value="edit" disabled={busy}>Save reviewed proposal</button><button className="button" name="decision" value="apply" disabled={busy || dirty || stale || item.status !== "pending"}>Confirm and apply</button><button className="button secondary" name="decision" value="clarify" disabled={busy}>Needs clarification</button><button className="button secondary" name="decision" value="reject" disabled={busy}>Reject</button></div>
        {dirty && <p className="muted">Save your reviewed changes before applying.</p>}
      </form> : <p>{item.status === "applied" ? "Applied through the app’s normal financial rules." : "This item is resolved; it cannot be applied again."} {invoice && typeof outcome?.recordId === "string" && <Link className="text-link" href={`/invoices/${outcome.recordId}`}>Open saved invoice</Link>}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </section>;
}
