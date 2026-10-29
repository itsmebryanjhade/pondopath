"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import type { AiProposal, AiRequest } from "@/lib/domain/ai";
import { aiOutputSchemas } from "@/lib/domain/ai";
import { DashboardIcon } from "./dashboard-icon";
import { TextAreaField } from "./command-form";
import { CollectionPanel } from "./collection-panel";
import { ReminderPanel } from "./reminder-panel";
import { CashImpact } from "./cash-impact";
import { calculateForecast, compareScenario } from "@/lib/domain/forecast";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";

export function AiAssistant({ workspace }: { workspace: WorkspaceSnapshot }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const answer = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const router = useRouter();
  const pathname = usePathname();
  const headingId = useId();
  const [task, setTask] = useState<AiRequest["task"]>("explain");
  const [selected, setSelected] = useState("");
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [language, setLanguage] = useState<AiRequest["language"]>("auto");
  const [tone, setTone] = useState<"polite" | "firm">("polite");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<AiProposal | null>(null);
  const [sourceReply, setSourceReply] = useState("");
  const [review, setReview] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const forecast = useMemo(() => calculateForecast(workspace.forecastInput), [workspace.forecastInput]);
  useEffect(() => { if (proposal && dialog.current?.open) answer.current?.focus(); }, [proposal]);
  const invoice = workspace.invoices.find(row => row.id === selected);
  const proposalInvoice = proposal && "invoiceId" in proposal ? workspace.invoices.find(row => row.id === proposal.invoiceId) : undefined;
  const customer = proposalInvoice ? workspace.customers.find(row => row.id === proposalInvoice.customer_id) : undefined;
  const stale = !!proposal && proposal.sourceRevision !== workspace.revision;
  const confirmed = proposal?.task === "extract_reply" && !proposal.needsReview && proposal.amountCents !== null && proposal.date !== null && proposalInvoice;
  let impact: ReturnType<typeof compareScenario> | null = null;
  if (confirmed && !stale && proposal?.task === "extract_reply") {
    impact = compareScenario(workspace.forecastInput, { invoiceId: proposalInvoice.id, date: proposal.date!, amountCents: proposal.amountCents! });
  }

  function chooseInvoice(id: string) {
    generation.current += 1;
    setSelected(id); setProposal(null); setReview(false); setError("");
  }
  function open() {
    const current = workspace.invoices.find(row => pathname === `/invoices/${row.id}`);
    if (current && current.id !== selected) chooseInvoice(current.id);
    dialog.current?.showModal();
  }
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const requestGeneration = ++generation.current;
    busy.current = true; setPending(true); setError(""); setProposal(null); setReview(false);
    try {
      const input = { task, language, expectedRevision: workspace.revision, ...(selected ? { invoiceId: selected } : {}), ...(task === "explain" ? { question } : task === "extract_reply" ? { reply } : { tone }) };
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(35_000) });
      if (response.redirected) throw new Error("Sign in again to use the assistant. Your message is retained.");
      const result = await response.json();
      if (generation.current !== requestGeneration) return;
      if (!response.ok || !result.ok) throw new Error(result.message || "The assistant is unavailable. Your message is retained.");
      aiOutputSchemas[task].parse(task === "explain" ? { summary: result.proposal.summary, recordIds: result.proposal.recordIds } : task === "extract_reply" ? { invoiceId: result.proposal.invoiceId, amountCents: result.proposal.amountCents, date: result.proposal.date, reason: result.proposal.reason, sourceQuotes: result.proposal.sourceQuotes, needsReview: result.proposal.needsReview, issues: result.proposal.issues } : { body: result.proposal.body });
      setProposal(result.proposal); setSourceReply(reply); setAnswerOpen(true);
    } catch (failure) {
      setError(failure instanceof Error && !["TimeoutError", "AbortError", "SyntaxError", "ZodError"].includes(failure.name) ? failure.message : "The assistant could not finish. Your input is retained; retry or use the manual forms.");
    } finally { busy.current = false; setPending(false); }
  }
  return <>
    <button type="button" className="assistant-launch" onClick={open}><DashboardIcon name="sparkle" size={18} />AI assistant</button>
    <dialog ref={dialog} className="assistant-dialog" aria-labelledby={headingId}>
      <header className="assistant-heading"><div><span className="eyebrow">PondoPath · AI assistance</span><h2 id={headingId}>Ask about your cash plan</h2><p>English, Tagalog or Taglish</p></div><button type="button" className="icon-button" aria-label="Close AI assistant" onClick={() => dialog.current?.close()}>×</button></header>
      <div className="assistant-content">
        <p className="assistant-notice">Selected business records are processed externally through OpenRouter. Suggestions need review; calculations and saved records remain controlled by PondoPath.</p>
        <dl className="assistant-extracted assistant-notice" aria-label="Calculated cash facts"><div><dt>Recorded available cash</dt><dd>{formatPHP(workspace.forecastInput.availableCents)}</dd></div><div><dt>Baseline projected closing cash · 30 days</dt><dd>{formatPHP(forecast.days[29].closingCents)}</dd></div><div><dt>First baseline shortage</dt><dd>{forecast.firstShortage ? `${formatPHP(forecast.firstShortage.shortfallCents)} on ${formatPlanDate(forecast.firstShortage.date)}` : "None projected from entered records"}</dd></div></dl>
        <form onSubmit={ask} className="assistant-form">
          <fieldset disabled={pending}>
            <label className="form-field"><span>How can I help?</span><select className="field" value={task} onChange={event => { setTask(event.target.value as AiRequest["task"]); setReview(false); setProposal(null); }}><option value="explain">Explain the cash plan</option><option value="extract_reply">Understand a customer reply</option><option value="draft_reminder">Prepare a payment reminder</option></select></label>
            <div className="form-grid">
              <label className="form-field"><span>Invoice {task === "explain" ? "(optional)" : "(required)"}</span><select className="field" value={selected} required={task !== "explain"} onChange={event => chooseInvoice(event.target.value)}><option value="">Whole cash plan</option>{workspace.invoices.map(row => <option key={row.id} value={row.id}>{row.number}</option>)}</select></label>
              <label className="form-field"><span>Response language</span><select className="field" value={language} onChange={event => setLanguage(event.target.value as AiRequest["language"])}><option value="auto">Match my language</option><option value="english">English</option><option value="tagalog">Tagalog</option><option value="taglish">Taglish</option></select></label>
            </div>
            {task === "explain" && <TextAreaField label="Your question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Bakit maaaring kulang ang cash next week?" maxLength={1000} required />}
            {task === "extract_reply" && <TextAreaField label="Original customer reply" value={reply} onChange={event => setReply(event.target.value)} placeholder="Sa 2026-11-06 po, PHP 20000 muna." maxLength={4000} rows={4} required />}
            {task === "draft_reminder" && <label className="form-field"><span>Reminder tone</span><select className="field" value={tone} onChange={event => setTone(event.target.value as "polite" | "firm")}><option value="polite">Polite</option><option value="firm">Firm and professional</option></select></label>}
            {invoice && <p className="muted">{invoice.number}: {formatPHP(invoice.outstanding_cents)} outstanding. Reference date: {formatPlanDate(workspace.forecastInput.referenceDate)}.</p>}
            <button type="submit" className="section-primary">{pending ? "Preparing a suggestion…" : "Ask assistant"}<DashboardIcon name="arrowRight" size={15} /></button>
          </fieldset>
        </form>
        <div role="status" aria-live="polite">{pending && <p className="muted">Reading the selected records. No financial changes are being made.</p>}</div>
        {error && <div role="alert" className="assistant-notice negative"><p>{error}</p><button type="button" className="text-link" onClick={() => router.refresh()}>Refresh records</button></div>}
        {proposal && <section ref={answer} tabIndex={-1} className="assistant-answer" aria-label="AI suggestion" aria-live="polite">
          <div className="assistant-answer-heading"><strong>Suggestion for review</strong><button type="button" className="text-link" aria-expanded={answerOpen} onClick={() => setAnswerOpen(!answerOpen)}>{answerOpen ? "Hide" : "Show"}</button></div>
          {answerOpen && <>
            <p className="muted">Based on record revision {proposal.sourceRevision}. Expected receipts are not available cash.</p>
            {proposalInvoice && <p><strong>Source invoice: {proposalInvoice.number}</strong></p>}
            {stale && <p role="alert" className="negative">Records changed. Ask again before using this proposal.</p>}
            {proposal.task === "explain" && <><p className="assistant-response">{proposal.summary}</p><nav aria-label="Supporting records">{proposal.recordIds.map(id => <Link key={id} className="text-link" href={workspace.invoices.some(row => row.id === id) ? `/invoices/${id}` : `/expenses#expense-${id}`} onClick={() => dialog.current?.close()}>{workspace.invoices.find(row => row.id === id)?.number ?? workspace.expenses.find(row => row.id === id)?.label ?? "Review source"} →</Link>)}</nav></>}
            {proposal.task === "extract_reply" && <>
              <blockquote className="assistant-response">{sourceReply}</blockquote>
              <dl className="assistant-extracted"><div><dt>Proposed remaining receipt</dt><dd>{proposal.amountCents === null ? "Needs clarification" : formatPHP(proposal.amountCents)}</dd></div><div><dt>Proposed date</dt><dd>{proposal.date ? formatPlanDate(proposal.date) : "Needs clarification"}</dd></div></dl>
              {proposal.reason && <p>{proposal.reason}</p>}
              {proposal.needsReview && <p className="negative">Clarification or payment verification is required. Use the original invoice’s manual review form after checking the details.</p>}
              {proposal.issues.length > 0 && <ul>{proposal.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
              {impact && <CashImpact {...impact} />}
              {confirmed && !stale && <button type="button" className="section-primary" onClick={() => setReview(true)}>Review receipt-plan fields</button>}
              {review && confirmed && !stale && <CollectionPanel key={sourceReply} workspace={workspace} invoice={proposalInvoice} proposed={{ amountCents: proposal.amountCents!, date: proposal.date!, sourceNote: sourceReply }} />}
            </>}
            {proposal.task === "draft_reminder" && <><p className="assistant-response">{proposal.body}</p><p className="muted">Saving a draft does not approve or send it.</p>{!stale && <button type="button" className="section-primary" onClick={() => setReview(true)}>Review reminder draft</button>}{review && !stale && proposalInvoice && customer && <ReminderPanel key={proposal.body} workspace={workspace} invoice={proposalInvoice} customer={customer} template={proposal.body} suggestedBody={proposal.body} />}</>}
          </>}
        </section>}
        <p className="muted">Manual entry and reminder templates remain available when AI is unavailable. Each request attempt uses the business’s daily allowance.</p>
      </div>
    </dialog>
  </>;
}
