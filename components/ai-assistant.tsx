"use client";

import {
  useEffect,
  useId,
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
import { CashImpact } from "./cash-impact";
import { calculateForecast, compareScenario } from "@/lib/domain/forecast";
import { formatPHP } from "@/lib/domain/money";
import { formatPlanDate } from "@/lib/display";
import {
  assistantPage,
  generatePageStarters,
  resolveAssistantDraftTarget,
  sendAssistantChat,
  sendReplyExtraction,
  type AssistantChatScope,
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

export function AiAssistant({ workspace, dialog, onClose }: {
  workspace: WorkspaceSnapshot;
  dialog: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
}) {
  const toolsButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const replyPicker = useRef<HTMLSelectElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const headingId = useId();

  const [mode, setMode] = useState<"chat" | "reply">("chat");
  const [language, setLanguage] = useState<AiRequest["language"]>("auto");
  const [composerText, setComposerText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  const [draftIntent, setDraftIntent] = useState<AssistantChatScope["intent"]>();
  const [draftInvoiceId, setDraftInvoiceId] = useState("");
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
  const currentInvoice = workspace.invoices.find(row => pathname === "/invoices/" + row.id);
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
    if (toolsOpen) {
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[focusedMenuIndex]?.focus();
    }
  }, [toolsOpen, focusedMenuIndex]);

  useEffect(() => {
    if (mode === "reply") replyPicker.current?.focus();
  }, [mode]);

  function close() {
    dialog.current?.close();
  }

  function clearChat() {
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
    setToolsOpen(false);
    setMode("chat");
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = composerText.trim();
    if (!text || activeRequest.current || runtime.thread.getState().isRunning) return;
    if (draftIntent && !draftInvoice) {
      setChatError("Choose an unpaid invoice for this draft.");
      return;
    }

    const invoice = draftIntent ? draftInvoice : currentInvoice;
    const page = assistantPage(pathname) ?? (invoice ? "invoices" : undefined);
    const scope: AssistantChatScope = {
      expectedRevision: workspace.revision, language, intent: draftIntent,
      context: page ? { page, record: invoice ? { kind: "invoice", id: invoice.id } : undefined } : undefined,
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
            <p>English, Tagalog or Taglish</p>
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

        <div className="assistant-content">
          <p className="assistant-notice">
            Selected records and messages are processed externally by Gemini. Use fictional data
            only. Review suggestions before saving.
          </p>

          <dl className="assistant-extracted assistant-notice" aria-label="Calculated cash facts">
            <div>
              <dt>Recorded available cash</dt>
              <dd>{formatPHP(workspace.forecastInput.availableCents)}</dd>
            </div>
            <div>
              <dt>Baseline projected closing cash · 30 days</dt>
              <dd>{formatPHP(forecast.days[29].closingCents)}</dd>
            </div>
            <div>
              <dt>First baseline shortage</dt>
              <dd>
                {forecast.firstShortage
                  ? `${formatPHP(forecast.firstShortage.shortfallCents)} on ${formatPlanDate(
                    forecast.firstShortage.date
                  )}`
                  : "None projected from entered records"}
              </dd>
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
          ) : (
            <ThreadPrimitive.Root className="assistant-chat-mode">
              <AuiIf condition={state => state.thread.messages.length === 0}>
                <div className="assistant-empty-thread">
                  <p className="muted">Ask a question or pick a starter.</p>
                  <div className="assistant-starters" role="group" aria-label="Suggested questions">
                    {starters.map(starter => (
                      <button key={starter} type="button" className="assistant-starter-btn" disabled={isSending}
                        onClick={() => prepareQuestion(starter)}>
                        <strong>{starter}</strong>
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
              </div>

              {activeReview?.draft && (
                <div className="assistant-active-draft-panel">
                  <div className="assistant-draft-header">
                    <strong>{reviewTarget ? "Reviewing invoice " + reviewTarget.invoice.number : "Review draft"}</strong>
                    <button type="button" className="text-link" onClick={() => setReview(null)}>Hide draft review</button>
                  </div>
                  {!reviewTarget ? <p role="alert" className="negative">Records changed. Ask for a fresh draft before reviewing.</p>
                    : activeReview.draft.kind === "reminder" ? (
                      <ReminderPanel
                        key={review?.messageId}
                        workspace={workspace}
                        invoice={reviewTarget.invoice}
                        customer={reviewTarget.customer}
                        template={activeReview.draft.text}
                        suggestedBody={activeReview.draft.text}
                      />
                    ) : (
                      <>
                        <blockquote className="assistant-response">{activeReview.draft.text}</blockquote>
                        <p>Due {formatPlanDate(activeReview.draft.date)}</p>
                        <Link className="text-link" href={"/invoices/" + reviewTarget.invoice.id} onClick={close}>
                          Open invoice to add follow-up
                        </Link>
                      </>
                    )}
                </div>
              )}

              {chatError && (
                <div role="alert" className="assistant-notice negative">
                  <p>{chatError}</p>
                  <button type="button" className="text-link" onClick={() => router.refresh()}>Refresh records</button>
                </div>
              )}

              <ComposerPrimitive.Root className="assistant-composer-root" onSubmit={handleSend}>
                {draftIntent && (
                  <label className="form-field">
                    <span>Invoice for this draft</span>
                    <select className="field" value={draftInvoice?.id ?? ""} disabled={isSending} required
                      onChange={event => setDraftInvoiceId(event.target.value)}>
                      <option value="">Choose an unpaid invoice</option>
                      {openInvoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}
                    </select>
                    {draftIntent === "draft_followup" && <small>Include one due date in YYYY-MM-DD format.</small>}
                  </label>
                )}
                <div className="assistant-composer-bar">
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
                  <textarea
                    ref={composerInputRef}
                    className="field assistant-composer-input"
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
                  <button type="submit" className="section-primary assistant-send-btn"
                    disabled={!composerText.trim() || isSending} aria-label="Send message">
                    {isSending ? "Sending…" : "Send"}
                    <DashboardIcon name="arrowRight" size={15} />
                  </button>
                </div>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.Root>
          )}

          <p className="muted">
            Manual entry and reminder templates remain available when AI is unavailable. Each Gemini request uses the business’s daily allowance.
          </p>
        </div>
      </dialog>
    </AssistantRuntimeProvider>
  );
}
