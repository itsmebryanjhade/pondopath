"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
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
import {
  generatePageStarters,
  generateMockReply,
  createIsolatedChatModelAdapter,
  type MockChatReply,
} from "@/lib/ui/assistant-chat-adapter";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  facts?: { label: string; value: string }[];
  sources?: { id: string; label: string; href: string }[];
  draft?: MockChatReply["draft"];
};

export const WORKSPACE_TOOLS = [
  { id: "page", label: "Ask about this page" },
  { id: "reminder", label: "Draft a follow-up message" },
  { id: "followup", label: "Plan a follow-up task" },
  { id: "reply", label: "Understand a customer reply" },
  { id: "add_record", label: "Add a record from text" },
] as const;

export function AiAssistant({ workspace }: { workspace: WorkspaceSnapshot }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const launchButton = useRef<HTMLButtonElement>(null);
  const toolsButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const answer = useRef<HTMLElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const headingId = useId();

  // Dialog & view state
  const [mode, setMode] = useState<"chat" | "reply">("chat");
  const [language, setLanguage] = useState<AiRequest["language"]>("auto");
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [composerText, setComposerText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [lastAttemptedPrompt, setLastAttemptedPrompt] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  const [activeReviewDraft, setActiveReviewDraft] = useState<MockChatReply["draft"]>(null);
  const currentAbortController = useRef<AbortController | null>(null);
  const activeRunId = useRef<string | null>(null);

  // Source reply extraction state (preserved from legacy assistant)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyPending, setReplyPending] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [replyProposal, setReplyProposal] = useState<AiProposal | null>(null);
  const [sourceReplySaved, setSourceReplySaved] = useState("");
  const [replyReviewOpen, setReplyReviewOpen] = useState(false);

  // Setup isolated @assistant-ui/react runtime
  const adapter = useMemo(() => createIsolatedChatModelAdapter(workspace), [workspace]);
  const runtime = useLocalRuntime(adapter);

  const forecast = useMemo(
    () => calculateForecast(workspace.forecastInput),
    [workspace.forecastInput]
  );
  const starters = useMemo(() => generatePageStarters(pathname), [pathname]);

  const currentInvoice = workspace.invoices.find((row) => pathname === `/invoices/${row.id}`);
  const activeInvoice =
    workspace.invoices.find((row) => row.id === selectedInvoiceId) || currentInvoice;

  // Focus management when menu opens
  useEffect(() => {
    if (toolsOpen && menuRef.current) {
      const items = menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      items[focusedMenuIndex]?.focus();
    }
  }, [toolsOpen, focusedMenuIndex]);

  // Reset conversation on actor or business change
  const actorBusinessKey = `${workspace.business.id}:${workspace.actor.userId}`;
  const prevActorBusinessKey = useRef(actorBusinessKey);
  useEffect(() => {
    if (prevActorBusinessKey.current !== actorBusinessKey) {
      prevActorBusinessKey.current = actorBusinessKey;
      clearChat();
    }
  }, [actorBusinessKey]);

  function open() {
    if (currentInvoice && currentInvoice.id !== selectedInvoiceId) {
      setSelectedInvoiceId(currentInvoice.id);
    }
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
    setToolsOpen(false);
    launchButton.current?.focus();
  }

  function clearChat() {
    currentAbortController.current?.abort();
    currentAbortController.current = null;
    activeRunId.current = null;
    setIsSending(false);
    runtime.thread.reset();
    setMessages([]);
    setComposerText("");
    setActiveReviewDraft(null);
    setChatError("");
    setMode("chat");
  }

  function handleSend(textToSend?: string) {
    if (isSending) return;
    const text = (textToSend ?? composerText).trim();
    if (!text) return;

    setChatError("");
    setLastAttemptedPrompt(text);
    setIsSending(true);

    currentAbortController.current?.abort();
    const controller = new AbortController();
    currentAbortController.current = controller;
    const runId = crypto.randomUUID();
    activeRunId.current = runId;

    const userMsg: ChatItem = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };

    try {
      const reply = generateMockReply(text, workspace);
      if (controller.signal.aborted || activeRunId.current !== runId) {
        return;
      }

      const assistantMsg: ChatItem = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: reply.text,
        facts: reply.facts,
        sources: reply.sources,
        draft: reply.draft,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setComposerText("");
      runtime.thread.append({
        role: "user",
        content: [{ type: "text", text }],
      });
    } catch {
      if (!controller.signal.aborted) {
        setChatError("The assistant could not respond. Your question is retained; retry or use manual forms.");
      }
    } finally {
      if (activeRunId.current === runId) {
        setIsSending(false);
        activeRunId.current = null;
      }
    }
  }

  function selectTool(toolId: (typeof WORKSPACE_TOOLS)[number]["id"]) {
    setToolsOpen(false);
    toolsButton.current?.focus();

    if (toolId === "page") {
      setComposerText(starters[0] || "What should I know about this page?");
      composerInputRef.current?.focus();
      return;
    }

    if (toolId === "reminder") {
      const inv = activeInvoice || workspace.invoices[0];
      const target = inv ? inv.number : "open invoices";
      setComposerText(`Draft a payment reminder for ${target}`);
      composerInputRef.current?.focus();
      return;
    }

    if (toolId === "followup") {
      const inv = activeInvoice || workspace.invoices[0];
      const target = inv ? inv.number : "unpaid invoices";
      setComposerText(`Plan a follow-up task for ${target}`);
      composerInputRef.current?.focus();
      return;
    }

    if (toolId === "reply") {
      setMode("reply");
      return;
    }

    if (toolId === "add_record") {
      setComposerText("Add a record from text: ");
      composerInputRef.current?.focus();
      return;
    }
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

  // Preserve legacy reply extraction logic
  async function extractCustomerReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (replyPending) return;
    setReplyPending(true);
    setReplyError("");
    setReplyProposal(null);
    setReplyReviewOpen(false);

    try {
      const input = {
        task: "extract_reply" as const,
        language,
        expectedRevision: workspace.revision,
        invoiceId: selectedInvoiceId,
        reply: replyText,
      };
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(35_000),
      });
      if (response.redirected)
        throw new Error("Sign in again to use the assistant. Your message is retained.");
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.message || "The assistant is unavailable. Your message is retained.");
      aiOutputSchemas.extract_reply.parse({
        invoiceId: result.proposal.invoiceId,
        amountCents: result.proposal.amountCents,
        date: result.proposal.date,
        reason: result.proposal.reason,
        sourceQuotes: result.proposal.sourceQuotes,
        needsReview: result.proposal.needsReview,
        issues: result.proposal.issues,
      });
      setReplyProposal(result.proposal);
      setSourceReplySaved(replyText);
    } catch (failure) {
      setReplyError(
        failure instanceof Error &&
          !["TimeoutError", "AbortError", "SyntaxError", "ZodError"].includes(failure.name)
          ? failure.message
          : "The assistant could not finish. Your input is retained; retry or use the manual forms."
      );
    } finally {
      setReplyPending(false);
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
    proposalInvoice;

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
      <button
        ref={launchButton}
        type="button"
        className="assistant-launch"
        onClick={open}
        aria-label="Open AI assistant"
      >
        <DashboardIcon name="sparkle" size={18} />
        AI assistant
      </button>

      <dialog ref={dialog} className="assistant-dialog" aria-labelledby={headingId}>
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
                      value={selectedInvoiceId}
                      required
                      onChange={(e) => setSelectedInvoiceId(e.target.value)}
                    >
                      <option value="" disabled>
                        Select an invoice
                      </option>
                      {workspace.invoices.map((inv) => (
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
                  ref={answer}
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
                    <p className="negative">
                      Clarification or payment verification is required. Use the original invoice’s
                      manual review form after checking the details.
                    </p>
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
            /* Conversational Chat View */
            <div className="assistant-chat-mode">
              {messages.length === 0 ? (
                <div className="assistant-empty-thread">
                  <p className="muted">Ask any question or pick a starter below:</p>
                  <div
                    className="assistant-starters"
                    role="group"
                    aria-label="Suggested questions"
                  >
                    {starters.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        className="assistant-starter-btn"
                        onClick={() => handleSend(starter)}
                      >
                        <strong>{starter}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="assistant-messages" role="log" aria-live="polite">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`assistant-msg ${msg.role}`}>
                      <p className="assistant-msg-text">{msg.text}</p>
                      {msg.facts && msg.facts.length > 0 && (
                        <dl className="assistant-extracted">
                          {msg.facts.map((fact) => (
                            <div key={fact.label}>
                              <dt>{fact.label}</dt>
                              <dd>{fact.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {msg.sources && msg.sources.length > 0 && (
                        <nav aria-label="Supporting records" className="assistant-msg-sources">
                          {msg.sources.map((src) => (
                            <Link
                              key={src.id}
                              className="text-link"
                              href={src.href}
                              onClick={close}
                            >
                              {src.label} →
                            </Link>
                          ))}
                        </nav>
                      )}
                      {msg.draft && (
                        <div
                          className={`assistant-draft-card${
                            msg.draft.sourceRevision !== undefined &&
                            msg.draft.sourceRevision !== workspace.revision
                              ? " stale"
                              : ""
                          }`}
                        >
                          <p>
                            <strong>{msg.draft.title}</strong>
                          </p>
                          {msg.draft.suggestedBody && (
                            <blockquote className="assistant-response">
                              {msg.draft.suggestedBody}
                            </blockquote>
                          )}
                          {msg.draft.sourceRevision !== undefined &&
                          msg.draft.sourceRevision !== workspace.revision ? (
                            <p className="negative" style={{ fontSize: "12px", margin: "4px 0" }}>
                              This draft was prepared for revision {msg.draft.sourceRevision}. The
                              workspace is now at revision {workspace.revision}.
                            </p>
                          ) : (
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => setActiveReviewDraft(msg.draft)}
                            >
                              Review draft
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Active Draft Review Panel Handoff */}
              {activeReviewDraft && (
                <div className="assistant-active-draft-panel">
                  <div className="assistant-draft-header">
                    <strong>Reviewing: {activeReviewDraft.title}</strong>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setActiveReviewDraft(null)}
                    >
                      Hide draft review
                    </button>
                  </div>
                  {activeReviewDraft.sourceRevision !== undefined &&
                  activeReviewDraft.sourceRevision !== workspace.revision ? (
                    <div role="alert" className="assistant-notice negative">
                      <p>
                        This draft was prepared for revision {activeReviewDraft.sourceRevision}, but
                        the workspace is now at revision {workspace.revision}. Refresh or ask again
                        to generate an up-to-date draft.
                      </p>
                    </div>
                  ) : activeReviewDraft.kind === "reminder" ? (
                    <ReminderPanel
                      workspace={workspace}
                      invoice={
                        workspace.invoices.find((i) => i.id === activeReviewDraft.invoiceId) ||
                        workspace.invoices[0]
                      }
                      customer={workspace.customers[0]}
                      template={activeReviewDraft.suggestedBody || ""}
                      suggestedBody={activeReviewDraft.suggestedBody}
                    />
                  ) : null}
                </div>
              )}

              {chatError && (
                <div role="alert" className="assistant-notice negative" style={{ margin: "8px 0" }}>
                  <p>{chatError}</p>
                  {lastAttemptedPrompt && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => handleSend(lastAttemptedPrompt)}
                    >
                      Retry question
                    </button>
                  )}
                </div>
              )}

              {/* Sticky Composer & Accessible Workspace tools (+) Menu */}
              <div className="assistant-composer-root">
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
                      onClick={() => setToolsOpen(!toolsOpen)}
                    >
                      + Workspace tools
                    </button>

                    {toolsOpen && (
                      <div
                        ref={menuRef}
                        className="assistant-tools-menu"
                        role="menu"
                        aria-label="Workspace tools"
                        onKeyDown={handleMenuKeyDown}
                      >
                        {WORKSPACE_TOOLS.map((tool, index) => (
                          <button
                            key={tool.id}
                            type="button"
                            role="menuitem"
                            tabIndex={focusedMenuIndex === index ? 0 : -1}
                            className="assistant-tools-item"
                            onClick={() => selectTool(tool.id)}
                          >
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
                    placeholder="Ask about cash, invoices, or bills…"
                    value={composerText}
                    disabled={isSending}
                    onChange={(e) => setComposerText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!isSending) {
                          handleSend();
                        }
                      }
                    }}
                  />

                  <button
                    type="button"
                    className="section-primary assistant-send-btn"
                    disabled={!composerText.trim() || isSending}
                    onClick={() => handleSend()}
                    aria-label="Send message"
                  >
                    {isSending ? "Sending…" : "Send"}
                    <DashboardIcon name="arrowRight" size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="muted">
            Manual entry and reminder templates remain available when AI is unavailable. Each
            request attempt uses the business’s daily allowance.
          </p>
        </div>
      </dialog>
    </AssistantRuntimeProvider>
  );
}
