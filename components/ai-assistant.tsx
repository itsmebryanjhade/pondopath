"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AssistantRuntimeProvider, AuiIf, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import type { AiProposal, AiRequest } from "@/lib/domain/ai";
import type { AssistantChatProposal } from "@/lib/domain/assistant-chat";
import { DashboardIcon } from "./dashboard-icon";
import { TextAreaField } from "./command-form";
import { CollectionPanel } from "./collection-panel";
import { ReminderPanel } from "./reminder-panel";
import { FollowupForm } from "./followup-panel";
import { CustomerForm, ExpenseForm, InvoiceForm } from "./record-forms";
import { CashImpact } from "./cash-impact";
import { calculateForecast, compareScenario } from "@/lib/domain/forecast";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import {
  assistantContextMatchesPath,
  assistantContextProblem,
  assistantContextWorkspace,
  assistantPage,
  generatePageStarters,
  resolveAssistantDraftTarget,
  sendAssistantChat,
  sendReplyExtraction,
  type AssistantChatScope,
  type AssistantContextEntry,
} from "@/lib/ui/assistant-chat-adapter";

const cancelled = { status: { type: "incomplete", reason: "cancelled" } } as const;

function assistantError(error: unknown) {
  return error instanceof Error ? error.message : "The assistant is unavailable. Your message is retained.";
}

export const WORKSPACE_TOOLS = [
  { id: "page", label: "Ask about this page" },
  { id: "reminder", label: "Draft a follow-up message" },
  { id: "followup", label: "Plan a follow-up task" },
  { id: "reply", label: "Understand a customer reply" },
  { id: "add_record", label: "Add a record from text" },
] as const;

export function AiAssistant({ workspace: layoutWorkspace, dialog, onClose, initialEntry, prepareEntryRef }: {
  workspace: WorkspaceSnapshot;
  dialog: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  initialEntry?: AssistantContextEntry;
  prepareEntryRef?: RefObject<((entry?: AssistantContextEntry) => void) | null>;
}) {
  const toolsButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyPicker = useRef<HTMLSelectElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const headingId = useId();

  const [mode, setMode] = useState<"chat" | "reply" | "add_record">("chat");
  const [language, setLanguage] = useState<AiRequest["language"]>("auto");
  const [entry, setEntry] = useState(initialEntry);
  const workspace = assistantContextWorkspace(entry, layoutWorkspace);
  const [composerText, setComposerText] = useState(initialEntry?.starterText ?? "");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  const [draftIntent, setDraftIntent] = useState(initialEntry?.intent);
  const [draftInvoiceId, setDraftInvoiceId] = useState(initialEntry?.context.record?.id ?? "");
  const [review, setReview] = useState<{ messageId: string; proposal: AssistantChatProposal } | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const queuedChat = useRef<AssistantChatScope | null>(null);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyPending, setReplyPending] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [replyProposal, setReplyProposal] = useState<Extract<AiProposal, { task: "extract_reply" }> | null>(null);
  const [sourceReplySaved, setSourceReplySaved] = useState("");
  const [replyReviewOpen, setReplyReviewOpen] = useState(false);

  const [recordText, setRecordText] = useState("");
  const [recordPending, setRecordPending] = useState(false);
  const [recordError, setRecordError] = useState("");
  const [recordProposal, setRecordProposal] = useState<Extract<AiProposal, { task: "extract_record" }> | null>(null);
  const [activeFormProposal, setActiveFormProposal] = useState<
    Extract<AiProposal, { task: "extract_record" }>["proposals"][number] | null
  >(null);

  const adapter = useMemo<ChatModelAdapter>(() => ({
    async run({ messages, abortSignal }) {
      const controller = activeRequest.current;
      const scope = queuedChat.current;
      queuedChat.current = null;
      if (!controller || !scope) return cancelled;
      const signal = AbortSignal.any([controller.signal, abortSignal]);
      try {
        const proposal = await sendAssistantChat(messages, scope, signal);
        signal.throwIfAborted();
        if (activeRequest.current !== controller) return cancelled;
        setComposerText("");
        if (proposal.kind === "answer") {
          setDraftIntent(undefined);
          setDraftInvoiceId("");
        }
        return { content: [
          { type: "text", text: proposal.summary },
          { type: "data", name: "pondopath-proposal", data: proposal },
        ] };
      } catch (error) {
        if (signal.aborted || activeRequest.current !== controller) return cancelled;
        setChatError(assistantError(error));
        return { status: { type: "incomplete", reason: "error" } };
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setIsSending(false);
        }
      }
    },
  }), []);
  const runtime = useLocalRuntime(adapter);
  const forecast = useMemo(() => calculateForecast(workspace.forecastInput), [workspace.forecastInput]);
  const starters = generatePageStarters(pathname);
  const contextualInvoiceId = entry?.context.record?.kind === "invoice" ? entry.context.record.id : undefined;
  const currentInvoice = workspace.invoices.find(row => contextualInvoiceId ? row.id === contextualInvoiceId : pathname === "/invoices/" + row.id);
  const contextLabel = entry && (currentInvoice ? "About invoice " + currentInvoice.number : "About this page");
  const openInvoices = workspace.invoices.filter(row => row.outstanding_cents > 0);
  const currentOpenInvoice = openInvoices.find(row => row.id === currentInvoice?.id);
  const draftInvoice = openInvoices.find(row => row.id === draftInvoiceId);
  const replyInvoice = openInvoices.find(row => row.id === selectedInvoiceId);
  const activeReview = review?.proposal;
  const reviewTarget = activeReview && resolveAssistantDraftTarget(workspace, activeReview);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [dialog]);

  useLayoutEffect(() => () => activeRequest.current?.abort(), [workspace.revision]);

  useEffect(() => {
    if (entry && dialog.current?.open) composerInputRef.current?.focus();
  }, [dialog, entry]);

  useEffect(() => {
    if (toolsOpen) {
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[focusedMenuIndex]?.focus();
    }
  }, [toolsOpen, focusedMenuIndex]);

  useEffect(() => {
    if (mode === "reply") replyPicker.current?.focus();
  }, [mode]);

  useEffect(() => {
    const el = composerInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 40), 140);
    el.style.height = `${nextHeight}px`;
  }, [composerText]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [isSending]);

  function close() {
    dialog.current?.close();
  }

  function clearChat() {
    setEntry(undefined);
    activeRequest.current?.abort();
    activeRequest.current = null;
    queuedChat.current = null;
    runtime.thread.cancelRun();
    runtime.thread.reset();
    setIsSending(false);
    setComposerText("");
    setReview(null);
    setChatError("");
    setDraftIntent(undefined);
    setDraftInvoiceId("");
    setSelectedInvoiceId("");
    setReplyText("");
    setSourceReplySaved("");
    setReplyProposal(null);
    setReplyReviewOpen(false);
    setReplyError("");
    setReplyPending(false);
    setRecordText("");
    setRecordProposal(null);
    setRecordError("");
    setRecordPending(false);
    setActiveFormProposal(null);
    setToolsOpen(false);
    setMode("chat");
  }

  useImperativeHandle(prepareEntryRef, () => nextEntry => {
    if (!nextEntry && (!entry || assistantContextMatchesPath(entry, pathname))) return;
    if (nextEntry && entry &&
        nextEntry.workspace.revision === entry.workspace.revision &&
        nextEntry.context.page === entry.context.page &&
        nextEntry.context.record?.kind === entry.context.record?.kind &&
        nextEntry.context.record?.id === entry.context.record?.id &&
        nextEntry.intent === entry.intent && nextEntry.starterText === entry.starterText) return;

    // A different card starts its own conversation in the shared dialog.
    clearChat();
    if (nextEntry) {
      setEntry(nextEntry);
      setComposerText(nextEntry.starterText);
      setDraftIntent(nextEntry.intent);
      setDraftInvoiceId(nextEntry.context.record?.id ?? "");
    }
  });

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = composerText.trim();
    if (!text || activeRequest.current || runtime.thread.getState().isRunning) return;
    const contextProblem = entry && assistantContextProblem(entry, pathname, workspace);
    if (contextProblem) {
      setChatError(contextProblem);
      return;
    }
    if (draftIntent && !draftInvoice) {
      setChatError("Choose an unpaid invoice for this draft.");
      return;
    }

    const invoice = draftIntent ? draftInvoice : currentInvoice;
    const page = entry?.context.page ?? assistantPage(pathname) ?? (invoice ? "invoices" : undefined);
    const scope: AssistantChatScope = {
      expectedRevision: entry?.workspace.revision ?? workspace.revision, language, intent: draftIntent,
      context: page ? { page, record: invoice ? { kind: "invoice", id: invoice.id } : entry?.context.record } : undefined,
    };
    activeRequest.current = new AbortController();
    queuedChat.current = scope;
    setChatError("");
    setIsSending(true);
    runtime.thread.append({ role: "user", content: [{ type: "text", text }] });
  }

  function prepareQuestion(text: string) {
    setDraftIntent(undefined);
    setDraftInvoiceId("");
    setComposerText(text);
    setChatError("");
    composerInputRef.current?.focus();
  }

  function selectTool(toolId: (typeof WORKSPACE_TOOLS)[number]["id"]) {
    setToolsOpen(false);
    toolsButton.current?.focus();
    if (toolId === "page") {
      prepareQuestion(starters[0]);
      return;
    }
    if (toolId === "reminder" || toolId === "followup") {
      setDraftIntent(toolId === "reminder" ? "draft_reminder" : "draft_followup");
      setDraftInvoiceId(currentOpenInvoice?.id ?? "");
      setComposerText(toolId === "reminder" ? "Draft a payment reminder for this invoice." : "Plan a follow-up for this invoice on ");
      setChatError("");
      composerInputRef.current?.focus();
      return;
    }
    if (toolId === "reply") {
      setSelectedInvoiceId(currentOpenInvoice?.id ?? "");
      setMode("reply");
      return;
    }
    if (toolId === "add_record") {
      setMode("add_record");
      setRecordError("");
      setActiveFormProposal(null);
      return;
    }
    close();
    router.push("/add");
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setToolsOpen(false);
      toolsButton.current?.focus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedMenuIndex((prev) => (prev + 1) % WORKSPACE_TOOLS.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedMenuIndex((prev) => (prev - 1 + WORKSPACE_TOOLS.length) % WORKSPACE_TOOLS.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setFocusedMenuIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setFocusedMenuIndex(WORKSPACE_TOOLS.length - 1);
      return;
    }
  }

  async function extractCustomerReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current || !replyInvoice) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setReplyPending(true);
    setReplyError("");
    setReplyProposal(null);
    setReplyReviewOpen(false);
    try {
      const proposal = await sendReplyExtraction({
        task: "extract_reply", language, expectedRevision: workspace.revision,
        invoiceId: replyInvoice.id, reply: replyText,
      }, controller.signal);
      controller.signal.throwIfAborted();
      if (activeRequest.current !== controller) return;
      setReplyProposal(proposal);
      setSourceReplySaved(replyText);
    } catch (error) {
      if (!controller.signal.aborted && activeRequest.current === controller) setReplyError(assistantError(error));
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setReplyPending(false);
      }
    }
  }

  async function extractRecordFromText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = recordText.trim();
    if (activeRequest.current || !text) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setRecordPending(true);
    setRecordError("");
    setRecordProposal(null);
    setActiveFormProposal(null);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          task: "extract_record",
          expectedRevision: workspace.revision,
          language,
          text,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.proposal) {
        throw new Error(data.message || "Failed to extract records. Check your input and try again.");
      }
      controller.signal.throwIfAborted();
      if (activeRequest.current !== controller) return;
      setRecordProposal(data.proposal);
    } catch (error) {
      if (!controller.signal.aborted && activeRequest.current === controller) {
        setRecordError(assistantError(error));
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setRecordPending(false);
      }
    }
  }

  const proposalInvoice =
    replyProposal && "invoiceId" in replyProposal
      ? workspace.invoices.find((row) => row.id === replyProposal.invoiceId)
      : undefined;
  const replyStale = !!replyProposal && replyProposal.sourceRevision !== workspace.revision;
  const replyConfirmed =
    replyProposal?.task === "extract_reply" &&
    !replyProposal.needsReview &&
    replyProposal.amountCents !== null &&
    replyProposal.date !== null &&
    proposalInvoice && selectedInvoiceId === proposalInvoice.id && replyText === sourceReplySaved;

  let replyImpact: ReturnType<typeof compareScenario> | null = null;
  if (replyConfirmed && !replyStale && replyProposal?.task === "extract_reply") {
    replyImpact = compareScenario(workspace.forecastInput, {
      invoiceId: proposalInvoice.id,
      date: replyProposal.date!,
      amountCents: replyProposal.amountCents!,
    });
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <dialog ref={dialog} className="assistant-dialog" aria-labelledby={headingId}
        onClose={() => { setToolsOpen(false); onClose(); }}>
        <header className="assistant-heading">
          <div>
            <span className="eyebrow">PondoPath · AI assistance</span>
            <h2 id={headingId}>Ask about your cash plan</h2>
            <p style={contextLabel ? { display: "block", overflowWrap: "anywhere" } : undefined}>
              {contextLabel ?? "English, Tagalog or Taglish"}
            </p>
          </div>
          <div className="assistant-header-controls">
            <select
              className="field assistant-lang-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value as AiRequest["language"])}
              aria-label="Response language"
            >
              <option value="auto">Match my language</option>
              <option value="english">English</option>
              <option value="tagalog">Tagalog</option>
              <option value="taglish">Taglish</option>
            </select>
            <button
              type="button"
              className="button secondary assistant-new-chat"
              onClick={clearChat}
            >
              New chat
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Close AI assistant"
              onClick={close}
            >
              ×
            </button>
          </div>
        </header>

        <div className="assistant-content assistant-body">
          <div className="assistant-scroll-area">
            <p className="assistant-notice">
              Selected records and messages are processed externally by Gemini. Use fictional data
              only. Review suggestions before saving.
            </p>

            <dl className="assistant-extracted assistant-notice assistant-cash-facts" aria-label="Calculated cash facts">
              <div className="assistant-cash-facts-header">
                <span className="assistant-cash-facts-title">Calculated cash facts</span>
                <span className="assistant-cash-facts-tag">30-day projection</span>
              </div>
              <div className="assistant-cash-facts-grid">
                <div className="assistant-fact-card">
                  <dt>Recorded available cash</dt>
                  <dd>{formatPHP(workspace.forecastInput.availableCents)}</dd>
                </div>
                <div className="assistant-fact-card">
                  <dt>Baseline projected closing cash · 30 days</dt>
                  <dd className={forecast.days[29].closingCents < 0 ? "negative-val" : ""}>
                    {formatPHP(forecast.days[29].closingCents)}
                  </dd>
                </div>
                <div className="assistant-fact-card">
                  <dt>First baseline shortage</dt>
                  <dd>
                    {forecast.firstShortage
                      ? `${formatPHP(forecast.firstShortage.shortfallCents)} on ${formatPlanDate(
                        forecast.firstShortage.date
                      )}`
                      : "None projected from entered records"}
                  </dd>
                </div>
              </div>
            </dl>

          {mode === "reply" ? (
            /* Preserved Separate Source-Reply Input */
            <div className="assistant-reply-mode">
              <div className="assistant-mode-header">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setMode("chat")}
                >
                  ← Back to conversation
                </button>
                <strong>Understand a customer reply</strong>
              </div>

              <form onSubmit={extractCustomerReply} className="assistant-form">
                <fieldset disabled={replyPending}>
                  <label className="form-field">
                    <span>Invoice (required)</span>
                    <select
                      className="field"
                      ref={replyPicker}
                      value={replyInvoice?.id ?? ""}
                      required
                      onChange={(e) => setSelectedInvoiceId(e.target.value)}
                    >
                      <option value="">
                        Select an invoice
                      </option>
                      {openInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.number}
                        </option>
                      ))}
                    </select>
                  </label>

                  <TextAreaField
                    label="Original customer reply"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Sa 2026-11-06 po, PHP 20000 muna."
                    maxLength={4000}
                    rows={4}
                    required
                  />

                  <button type="submit" className="section-primary">
                    {replyPending ? "Extracting reply…" : "Extract customer reply"}
                    <DashboardIcon name="arrowRight" size={15} />
                  </button>
                </fieldset>
              </form>

              {replyError && (
                <div role="alert" className="assistant-notice negative">
                  <p>{replyError}</p>
                  <button type="button" className="text-link" onClick={() => router.refresh()}>
                    Refresh records
                  </button>
                </div>
              )}

              {replyProposal && replyProposal.task === "extract_reply" && (
                <section
                  tabIndex={-1}
                  className="assistant-answer"
                  aria-label="Extracted reply proposal"
                >
                  <p className="muted">
                    Based on record revision {replyProposal.sourceRevision}. Expected receipts are
                    not available cash.
                  </p>
                  <blockquote className="assistant-response">{sourceReplySaved}</blockquote>
                  <dl className="assistant-extracted">
                    <div>
                      <dt>Proposed remaining receipt</dt>
                      <dd>
                        {replyProposal.amountCents === null
                          ? "Needs clarification"
                          : formatPHP(replyProposal.amountCents)}
                      </dd>
                    </div>
                    <div>
                      <dt>Proposed date</dt>
                      <dd>
                        {replyProposal.date
                          ? formatPlanDate(replyProposal.date)
                          : "Needs clarification"}
                      </dd>
                    </div>
                  </dl>
                  {replyProposal.reason && <p>{replyProposal.reason}</p>}
                  {replyProposal.needsReview && (
                    <div className="negative">
                      <p>Clarification or payment verification is required. Check the original reply before saving.</p>
                      <ul>{replyProposal.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
                    </div>
                  )}
                  {replyImpact && <CashImpact {...replyImpact} />}
                  {replyConfirmed && !replyStale && (
                    <button
                      type="button"
                      className="section-primary"
                      onClick={() => setReplyReviewOpen(true)}
                    >
                      Review receipt-plan fields
                    </button>
                  )}
                  {replyReviewOpen && replyConfirmed && !replyStale && (
                    <CollectionPanel
                      key={sourceReplySaved}
                      workspace={workspace}
                      invoice={proposalInvoice}
                      proposed={{
                        amountCents: replyProposal.amountCents!,
                        date: replyProposal.date!,
                        sourceNote: sourceReplySaved,
                      }}
                    />
                  )}
                </section>
              )}
            </div>
          ) : mode === "add_record" ? (
            <div className="assistant-add-record-mode">
              <div className="assistant-mode-header">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setMode("chat")}
                >
                  ← Back to conversation
                </button>
                <strong>Add a record from text</strong>
              </div>
              <p className="muted">
                Paste or type record details in English, Tagalog or Taglish (e.g. &apos;Invoice 1042, Northbay, 25k, due Nov 30&apos; or bill notes). The assistant extracts proposals for your manual review and confirmation.
              </p>

              <form onSubmit={extractRecordFromText} className="assistant-form">
                <fieldset disabled={recordPending}>
                  <TextAreaField
                    label="Record text (up to 1,000 characters)"
                    value={recordText}
                    onChange={(e) => setRecordText(e.target.value)}
                    placeholder="Invoice 1042, Northbay, 25k, due Nov 30"
                    maxLength={1000}
                    rows={4}
                    required
                  />

                  <button type="submit" className="section-primary" disabled={recordPending || !recordText.trim()}>
                    {recordPending ? "Extracting records…" : "Extract records"}
                    <DashboardIcon name="arrowRight" size={15} />
                  </button>
                </fieldset>
              </form>

              {recordError && (
                <div role="alert" className="assistant-notice negative">
                  <p>{recordError}</p>
                </div>
              )}

              {recordProposal && (
                <section className="assistant-review-panel">
                  <h3>Extracted proposals ({recordProposal.proposals.length})</h3>
                  {recordProposal.proposals.length === 0 ? (
                    <p className="empty-state">No records could be identified from the text. Check the details or use manual entry.</p>
                  ) : (
                    <div className="assistant-proposals-grid" style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
                      {recordProposal.proposals.map((item, index) => (
                        <div key={index} className="assistant-draft-card">
                          <p>
                            <strong>{item.kind === "invoice" ? "Invoice" : "Expense / Bill"}</strong>
                            {item.kind === "invoice" && item.number ? ` · ${item.number}` : ""}
                            {item.kind === "expense" && item.label ? ` · ${item.label}` : ""}
                          </p>
                          <p>
                            {item.kind === "invoice" ? "Customer: " : "Payee: "}
                            <strong>{item.party ?? "Unspecified"}</strong>
                            {item.amountCents !== null ? ` · ${formatPHP(item.amountCents)}` : " · Amount needs check"}
                            {item.dueDate ? ` · Due ${formatPlanDate(item.dueDate)}` : " · Due date needs check"}
                          </p>
                          {item.sourceQuotes.length > 0 && (
                            <blockquote className="assistant-response">
                              {item.sourceQuotes.join(" ")}
                            </blockquote>
                          )}
                          {item.issues.length > 0 && (
                            <ul className="negative" style={{ fontSize: "13px", paddingLeft: "20px", margin: "8px 0" }}>
                              {item.issues.map((issue, i) => (
                                <li key={i}>{issue}</li>
                              ))}
                            </ul>
                          )}
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => setActiveFormProposal(item)}
                          >
                            Open in form to review and save
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeFormProposal && (
                    <div className="panel proposal-review-panel" style={{ marginTop: "16px" }}>
                      <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <h4>Review and save {activeFormProposal.kind === "invoice" ? "invoice" : "expense"}</h4>
                          <p className="muted">Review the extracted values. Nothing is saved until you confirm.</p>
                        </div>
                        <button type="button" className="text-link" onClick={() => setActiveFormProposal(null)}>
                          Close form
                        </button>
                      </div>
                      {activeFormProposal.kind === "invoice" ? (
                        <>
                          <InvoiceForm
                            workspace={workspace}
                            initialProposed={{
                              number: activeFormProposal.number,
                              customerId: activeFormProposal.customerId,
                              party: activeFormProposal.party,
                              amountCents: activeFormProposal.amountCents,
                              dueDate: activeFormProposal.dueDate,
                            }}
                          />
                          {(!activeFormProposal.customerId || workspace.customers.length === 0) && (
                            <details className="add-entry-more" open={!activeFormProposal.customerId} style={{ marginTop: "12px" }}>
                              <summary>
                                {activeFormProposal.party
                                  ? `Add customer "${activeFormProposal.party}"`
                                  : "Customer not listed? Add a customer"}
                              </summary>
                              <CustomerForm
                                workspace={workspace}
                                initialName={activeFormProposal.party ?? undefined}
                              />
                            </details>
                          )}
                        </>
                      ) : (
                        <ExpenseForm
                          workspace={workspace}
                          initialProposed={{
                            label: activeFormProposal.label,
                            payee: activeFormProposal.party,
                            amountCents: activeFormProposal.amountCents,
                            dueDate: activeFormProposal.dueDate,
                          }}
                        />
                      )}
                    </div>
                  )}
                </section>
              )}
            </div>
          ) : (
            <ThreadPrimitive.Root className="assistant-chat-mode">
              <AuiIf condition={state => state.thread.messages.length === 0}>
                <div className="assistant-empty-thread">
                  <div className="assistant-empty-lead">
                    <DashboardIcon name="sparkle" size={15} />
                    <p className="muted">Ask a question or pick a starter.</p>
                  </div>
                  <div className="assistant-starters" role="group" aria-label="Suggested questions">
                    {starters.map(starter => (
                      <button key={starter} type="button" className="assistant-starter-btn" disabled={isSending}
                        onClick={() => prepareQuestion(starter)}>
                        <span className="assistant-starter-text"><strong>{starter}</strong></span>
                        <span className="assistant-starter-arrow">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              </AuiIf>

              <div className="assistant-messages" role="log" aria-live="polite" aria-busy={isSending}>
                <ThreadPrimitive.Messages>
                  {({ message }) => {
                    const text = message.content.find(part => part.type === "text");
                    if (text?.type !== "text") return null;
                    const part = message.content.find(item => item.type === "data" && item.name === "pondopath-proposal");
                    const proposal = part?.type === "data" ? part.data as AssistantChatProposal : null;
                    if (proposal && proposal.sourceRevision !== workspace.revision) {
                      return (
                        <MessagePrimitive.Root className="assistant-msg assistant">
                          <p className="muted">Records changed since this answer. Ask again for current facts.</p>
                        </MessagePrimitive.Root>
                      );
                    }
                    const target = proposal?.draft && resolveAssistantDraftTarget(workspace, proposal);
                    return (
                      <MessagePrimitive.Root className={"assistant-msg " + message.role}>
                        <div className="assistant-msg-header">
                          <span className="assistant-avatar-badge">
                            {message.role === "user" ? "You" : "PondoPath AI"}
                          </span>
                        </div>
                        <p className="assistant-msg-text">{text.text}</p>
                        {!!proposal?.facts.length && (
                          <dl className="assistant-extracted">
                            {proposal.facts.map(fact => (
                              <div key={fact.id}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                            ))}
                          </dl>
                        )}
                        {!!proposal?.sources.length && (
                          <nav aria-label="Supporting records" className="assistant-msg-sources">
                            {proposal.sources.map(source => (
                              <Link key={source.id} className="text-link" href={source.href} onClick={close}>
                                {source.label} →
                              </Link>
                            ))}
                          </nav>
                        )}
                        {proposal?.draft && (
                          <div className={"assistant-draft-card" + (target ? "" : " stale")}>
                            <p><strong>{proposal.draft.kind === "reminder" ? "Payment reminder" : "Follow-up task"}</strong></p>
                            <blockquote className="assistant-response">{proposal.draft.text}</blockquote>
                            {proposal.draft.kind === "followup" && <p>Due {formatPlanDate(proposal.draft.date)}</p>}
                            {target ? (
                              <button type="button" className="button secondary" onClick={() => setReview({ messageId: message.id, proposal })}>
                                Review draft
                              </button>
                            ) : <p className="negative">Records changed. Ask for a fresh draft before reviewing.</p>}
                          </div>
                        )}
                      </MessagePrimitive.Root>
                    );
                  }}
                </ThreadPrimitive.Messages>

                {isSending && (
                  <div className="assistant-msg assistant assistant-thinking" aria-label="Thinking">
                    <div className="assistant-msg-header">
                      <span className="assistant-avatar-badge">PondoPath AI</span>
                      <span className="assistant-thinking-text">Thinking…</span>
                    </div>
                    <div className="assistant-typing-dots">
                      <span className="dot" />
                      <span className="dot" />
                      <span className="dot" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {activeReview?.draft && (
                <DraftReviewPanel
                  key={review?.messageId}
                  draft={{
                    kind: activeReview.draft.kind,
                    title: reviewTarget ? "Reviewing invoice " + reviewTarget.invoice.number : "Review draft",
                    invoiceId: activeReview.draft.invoiceId,
                    suggestedBody: activeReview.draft.text,
                    actionDate: "date" in activeReview.draft ? activeReview.draft.date : undefined,
                    sourceRevision: activeReview.sourceRevision,
                  }}
                  workspace={workspace}
                  onHide={() => setReview(null)}
                />
              )}

              {chatError && (
                <div role="alert" className="assistant-notice negative">
                  <p>{chatError}</p>
                  <button type="button" className="text-link" onClick={() => router.refresh()}>Refresh records</button>
                </div>
              )}
            </ThreadPrimitive.Root>
          )}
        </div>

        {/* Anchored Bottom Composer */}
        <footer className="assistant-composer-wrap">
          <ComposerPrimitive.Root className="assistant-composer-root" onSubmit={handleSend}>
            {draftIntent && (
              <div className="assistant-draft-context-bar">
                <label className="form-field">
                  <span>Invoice for this draft</span>
                  <select className="field" value={draftInvoice?.id ?? ""} disabled={isSending} required
                    onChange={event => setDraftInvoiceId(event.target.value)}>
                    <option value="">Choose an unpaid invoice</option>
                    {openInvoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}
                  </select>
                  {draftIntent === "draft_followup" && <small>Include one due date in YYYY-MM-DD format.</small>}
                </label>
              </div>
            )}
            <div className="assistant-composer-card">
              <textarea
                ref={composerInputRef}
                className="field assistant-composer-input assistant-composer-textarea"
                rows={1}
                aria-label="Your message"
                placeholder="Ask about cash, invoices, or bills…"
                maxLength={1000}
                value={composerText}
                disabled={isSending}
                onChange={event => setComposerText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="assistant-composer-actions">
                <div className="assistant-tools-container">
                  <button
                    ref={toolsButton}
                    type="button"
                    className="assistant-tools-btn"
                    aria-haspopup="menu"
                    aria-expanded={toolsOpen}
                    aria-label="Workspace tools"
                    disabled={isSending}
                    onClick={() => { setFocusedMenuIndex(0); setToolsOpen(!toolsOpen); }}
                  >
                    + Workspace tools
                  </button>
                  {toolsOpen && (
                    <div ref={menuRef} className="assistant-tools-menu" role="menu" aria-label="Workspace tools" onKeyDown={handleMenuKeyDown}>
                      {WORKSPACE_TOOLS.map((tool, index) => (
                        <button key={tool.id} type="button" role="menuitem" tabIndex={focusedMenuIndex === index ? 0 : -1}
                          className="assistant-tools-item" onClick={() => selectTool(tool.id)}>
                          {tool.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="section-primary assistant-send-btn"
                  disabled={!composerText.trim() || isSending}
                  aria-label="Send message"
                >
                  <span className="assistant-send-label">Send</span>
                  <DashboardIcon name="arrowRight" size={14} />
                </button>
              </div>
            </div>
          </ComposerPrimitive.Root>

          <p className="muted assistant-disclaimer">
            Manual entry and reminder templates remain available when AI is unavailable. Each Gemini request uses the business’s daily allowance.
          </p>
        </footer>
      </div>
      </dialog>
    </AssistantRuntimeProvider>
  );
}

export function DraftReviewPanel({
  draft,
  workspace,
  onHide,
}: {
  draft: {
    kind: "reminder" | "followup";
    title?: string;
    invoiceId: string;
    suggestedBody?: string;
    text?: string;
    date?: string;
    actionDate?: string;
    sourceRevision?: number;
  };
  workspace: WorkspaceSnapshot;
  onHide?: () => void;
}) {
  const isStale =
    draft.sourceRevision !== undefined && draft.sourceRevision !== workspace.revision;
  const targetInvoice = workspace.invoices.find((i) => i.id === draft.invoiceId);
  const targetCustomer = targetInvoice
    ? workspace.customers.find((c) => c.id === targetInvoice.customer_id) ??
      workspace.customers[0]
    : undefined;

  const title = draft.title ?? (targetInvoice ? `Reviewing invoice ${targetInvoice.number}` : "Review draft");
  const suggestedBody = draft.suggestedBody ?? draft.text ?? "";
  const date = draft.actionDate ?? draft.date;

  return (
    <div className="assistant-active-draft-panel">
      <div className="assistant-draft-header">
        <strong>{title.startsWith("Reviewing") ? title : `Reviewing: ${title}`}</strong>
        {onHide && (
          <button type="button" className="text-link" onClick={onHide}>
            Hide draft review
          </button>
        )}
      </div>

      {isStale ? (
        <div role="alert" className="assistant-notice negative">
          <p>
            This draft was prepared for revision {draft.sourceRevision}, but the workspace is now at
            revision {workspace.revision}. Refresh or ask again to generate an up-to-date draft.
          </p>
        </div>
      ) : !targetInvoice ? (
        <div role="alert" className="assistant-notice negative">
          <p>
            The invoice targeted by this draft is no longer available in this workspace. Refresh
            records before reviewing.
          </p>
        </div>
      ) : draft.kind === "reminder" && targetCustomer ? (
        <ReminderPanel
          workspace={workspace}
          invoice={targetInvoice}
          customer={targetCustomer}
          template={suggestedBody}
          suggestedBody={suggestedBody}
        />
      ) : draft.kind === "followup" ? (
        <div className="panel followup-review-panel">
          <h2>Schedule follow-up task</h2>
          <p className="muted">
            For invoice <strong>{targetInvoice.number}</strong>. Current outstanding balance:{" "}
            <strong className="num">{formatPHP(targetInvoice.outstanding_cents)}</strong>. Saving
            schedules the task; it does not change the invoice balance.
          </p>
          <FollowupForm
            workspace={workspace}
            invoice={targetInvoice}
            proposed={{
              nextAction: suggestedBody,
              date,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
