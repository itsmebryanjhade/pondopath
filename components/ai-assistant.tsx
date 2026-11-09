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
import { AssistantContextChip } from "./assistant-context-chip";
import { AssistantIcon } from "./assistant-icon";
import { CollectionPanel } from "./collection-panel";
import { ReminderPanel } from "./reminder-panel";
import { FollowupForm } from "./followup-panel";
import { CustomerForm, ExpenseForm, InvoiceForm } from "./record-forms";
import { CashImpact } from "./cash-impact";
import { compareScenario } from "@/lib/domain/forecast";
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
  const pressedOutside = useRef(false);
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
  const [cardWorkspace, setCardWorkspace] = useState(initialEntry?.workspace);
  const workspace = assistantContextWorkspace(cardWorkspace, layoutWorkspace);
  const [composerText, setComposerText] = useState(initialEntry?.starterText ?? "");
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  const [draftIntent, setDraftIntent] = useState(initialEntry?.intent);
  const [draftInvoiceId, setDraftInvoiceId] = useState(initialEntry?.context.record?.id ?? "");
  const [review, setReview] = useState<{ messageId: string; proposal: AssistantChatProposal } | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [sentTags, setSentTags] = useState<string[]>([]);
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
  const starters = generatePageStarters(pathname);
  const contextualInvoiceId = entry?.context.record?.kind === "invoice" ? entry.context.record.id : undefined;
  const currentInvoice = workspace.invoices.find(row => contextualInvoiceId ? row.id === contextualInvoiceId : pathname === "/invoices/" + row.id);
  const contextLabel = entry && (currentInvoice ? "Invoice " + currentInvoice.number : entry.context.page === "forecast" ? "Cash forecast" : "This page");
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

  // Shrink back toward the launcher, then close. Instant when the person prefers reduced motion.
  function close() {
    const element = dialog.current;
    if (!element?.open || element.classList.contains("is-closing")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { element.close(); return; }
    element.classList.add("is-closing");
    window.setTimeout(() => { element.classList.remove("is-closing"); element.close(); }, 180);
  }

  // Something worth keeping is on screen: a conversation, a tool result or text in the box.
  const hasWork = (text = composerText) => runtime.thread.getState().messages.length > 0 || !!replyProposal || !!recordProposal
    || !!text.trim() || !!replyText.trim() || !!recordText.trim();
  function requestNewChat() {
    if (hasWork()) setConfirmClear(true);
    else clearChat();
  }

  function clearContext() {
    if (hasWork(composerText === entry?.starterText ? "" : composerText)) setConfirmClear(true);
    else clearChat();
  }

  function clearChat() {
    setEntry(undefined);
    setConfirmClear(false);
    setLastQuestion("");
    setSentTags([]);
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
    composerInputRef.current?.focus();
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
      setCardWorkspace(assistantContextWorkspace(nextEntry.workspace, workspace));
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
    setLastQuestion(text);
    setComposerText("");
    setSentTags(tags => [...tags, draftIntent && invoice
      ? (draftIntent === "draft_reminder" ? "Draft a follow-up message" : "Plan a follow-up task") + " · " + invoice.number
      : ""]);
    // A contextual draft may need another turn to clarify a date.
    if (!entry) {
      setDraftIntent(undefined);
      setDraftInvoiceId("");
    }
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
      setSelectedInvoiceId(currentOpenInvoice?.id ?? selectedInvoiceId);
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
    if (activeRequest.current) return;
    if (!replyInvoice) { setReplyError("Choose the invoice this reply is about."); return; }
    if (!replyText.trim()) { setReplyError("Paste the customer's message first."); return; }
    const controller = new AbortController();
    activeRequest.current = controller;
    setReplyPending(true);
    setMode("chat");
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
    setMode("chat");
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

  // One composer for everything. A chosen tool only changes what the composer sends.
  const tool: "reminder" | "followup" | "reply" | "add_record" | null =
    mode === "reply" ? "reply" : mode === "add_record" ? "add_record"
      : draftIntent === "draft_reminder" ? "reminder" : draftIntent === "draft_followup" ? "followup" : null;
  const busy = isSending || replyPending || recordPending;
  const composerValue = mode === "reply" ? replyText : mode === "add_record" ? recordText : composerText;
  const setComposerValue = (value: string) => {
    if (mode === "reply") setReplyText(value);
    else if (mode === "add_record") setRecordText(value);
    else setComposerText(value);
  };
  const placeholder = mode === "reply" ? "Paste the customer's message, e.g. Sa 2026-11-06 po, PHP 20000 muna."
    : mode === "add_record" ? "Type or paste the details, e.g. Invoice 1042, Northbay, 25k, due Nov 30"
    : tool === "followup" ? "Describe the follow-up and include a date (YYYY-MM-DD)"
    : "Ask about cash, invoices, or bills…";
  const toolLabel = tool === "reply" ? "Understand a customer reply" : tool === "add_record" ? "Add a record from text"
    : tool === "reminder" ? "Draft a follow-up message" : tool === "followup" ? "Plan a follow-up task" : "";
  const toolHint = tool === "reply" ? "Pick the invoice, paste the reply, then press Send. You review before anything is saved."
    : tool === "add_record" ? "Up to 3 records. Each opens in the normal form for you to check and save."
    : "Pick the unpaid invoice this is for.";
  const toolInvoice = tool === "reply" ? replyInvoice?.id ?? "" : draftInvoice?.id ?? "";
  const setToolInvoice = (id: string) => (tool === "reply" ? setSelectedInvoiceId(id) : setDraftInvoiceId(id));

  function closeTool() {
    setMode("chat");
    setDraftIntent(undefined);
    setDraftInvoiceId("");
    setReplyError("");
    setRecordError("");
    composerInputRef.current?.focus();
  }
  function submitComposer(event: FormEvent<HTMLFormElement>) {
    if (mode === "reply") return void extractCustomerReply(event);
    if (mode === "add_record") return void extractRecordFromText(event);
    handleSend(event);
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <dialog ref={dialog} className="assistant-dialog" aria-labelledby={headingId}
        onCancel={event => { event.preventDefault(); if (!toolsOpen && !confirmClear) close(); }}
        // A click on the dimmed area outside the panel closes it. Both the press and the release must land
        // there, so dragging to select text and letting go outside never closes it. Nothing is cleared.
        onPointerDown={event => { pressedOutside.current = event.target === event.currentTarget; }}
        onClick={event => {
          if (event.target !== event.currentTarget || !pressedOutside.current) return;
          const box = event.currentTarget.getBoundingClientRect();
          const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
          if (!inside) close();
        }}
        onClose={() => { setToolsOpen(false); onClose(); }}>
        <header className="assistant-heading">
          <div className="assistant-title">
            <span className="assistant-mark" aria-hidden="true"><AssistantIcon size={18} /></span>
            <div>
              <h2 id={headingId}>PondoPath Assistant</h2>
              <p>Ask about your cash, invoices and bills</p>
            </div>
          </div>
          <div className="assistant-header-controls">
            <button type="button" className="assistant-new-chat" aria-label="New chat" aria-expanded={confirmClear} onClick={requestNewChat}>
              <DashboardIcon name="plus" size={14} /><span className="assistant-new-chat-label">New chat</span>
            </button>
            <button type="button" className="assistant-close" aria-label="Close AI assistant" onClick={close}>×</button>
          </div>
        </header>

        {confirmClear && (
          <div className="assistant-confirm" role="alertdialog" aria-labelledby={headingId + "-confirm"}>
            <p id={headingId + "-confirm"}><strong>Start a new chat?</strong> This conversation and any unsaved drafts will be cleared.</p>
            <div>
              <button type="button" className="assistant-confirm-keep" autoFocus onClick={() => setConfirmClear(false)}>Keep chat</button>
              <button type="button" className="assistant-confirm-clear" onClick={clearChat}>Clear and start new</button>
            </div>
          </div>
        )}

        <div className="assistant-content assistant-body">
          <div className="assistant-scroll-area">
            <ThreadPrimitive.Root className="assistant-chat-mode">
              {!tool && (
                <AuiIf condition={state => state.thread.messages.length === 0}>
                  <div className="assistant-empty-thread">
                    <p className="assistant-greeting">Hi! What would you like to know?</p>
                    <div className="assistant-starters" role="group" aria-label="Suggested questions">
                      {starters.map(starter => (
                        <button key={starter} type="button" className="assistant-starter-btn" disabled={isSending}
                          onClick={() => prepareQuestion(starter)}>
                          <span className="assistant-starter-text">{starter}</span>
                          <span className="assistant-starter-arrow" aria-hidden="true"><DashboardIcon name="arrowRight" size={14} /></span>
                        </button>
                      ))}
                    </div>
                    <p className="assistant-section-label" id={headingId + "-tools"}>Or get help with a task</p>
                    <div className="assistant-tool-chips" role="group" aria-labelledby={headingId + "-tools"}>
                      {WORKSPACE_TOOLS.map(item => (
                        <button key={item.id} type="button" className="assistant-tool-chip" disabled={isSending}
                          onClick={() => selectTool(item.id)}>{item.label}</button>
                      ))}
                    </div>
                  </div>
                </AuiIf>
              )}

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
                          <p className="assistant-msg-text muted">Records changed since this answer. Ask again for current facts.</p>
                        </MessagePrimitive.Root>
                      );
                    }
                    const target = proposal?.draft && resolveAssistantDraftTarget(workspace, proposal);
                    return (
                      <MessagePrimitive.Root className={"assistant-msg " + message.role}>
                        {message.role === "user" && (() => {
                          const userIndex = runtime.thread.getState().messages.filter(row => row.role === "user").findIndex(row => row.id === message.id);
                          const tag = sentTags[userIndex];
                          return tag ? <span className="assistant-msg-tag">{tag}</span> : null;
                        })()}
                        {message.role !== "user" && <span className="assistant-avatar-badge">PondoPath</span>}
                        <p className="assistant-msg-text">{text.text}</p>
                        {!!proposal?.facts.length && (
                          <dl className="assistant-msg-facts">
                            {proposal.facts.map(fact => (
                              <div key={fact.id}><dt>{fact.label}</dt><dd className="num">{fact.value}</dd></div>
                            ))}
                          </dl>
                        )}
                        {!!proposal?.sources.length && (
                          <nav aria-label="Supporting records" className="assistant-msg-sources">
                            {proposal.sources.map(source => (
                              <Link key={source.id} className="assistant-source" href={source.href} onClick={close}>
                                {source.label}<DashboardIcon name="arrowRight" size={12} />
                              </Link>
                            ))}
                          </nav>
                        )}
                        {proposal?.draft && (
                          <div className={"assistant-draft-card" + (target ? "" : " stale")}>
                            <p className="assistant-draft-kind">{proposal.draft.kind === "reminder" ? "Payment reminder" : "Follow-up task"}{proposal.draft.kind === "followup" && <> · due {formatPlanDate(proposal.draft.date)}</>}</p>
                            <blockquote className="assistant-response">{proposal.draft.text}</blockquote>
                            {target ? (
                              <div className="assistant-draft-actions">
                                <button type="button" className="assistant-review-btn" onClick={() => setReview({ messageId: message.id, proposal })}>
                                  Review draft
                                </button>
                                <button type="button" className="assistant-copy-btn" onClick={() => {
                                  void navigator.clipboard?.writeText(proposal.draft!.text).then(() => {
                                    setCopiedId(message.id);
                                    window.setTimeout(() => setCopiedId(current => (current === message.id ? "" : current)), 2000);
                                  }, () => {});
                                }}>{copiedId === message.id ? "Copied" : "Copy text"}</button>
                              </div>
                            ) : <p className="negative">Records changed. Ask for a fresh draft before reviewing.</p>}
                          </div>
                        )}
                      </MessagePrimitive.Root>
                    );
                  }}
                </ThreadPrimitive.Messages>

                {isSending && (
                  <div className="assistant-msg assistant assistant-thinking" aria-label="Thinking">
                    <span className="assistant-avatar-badge">PondoPath</span>
                    <span className="assistant-typing-dots" aria-hidden="true"><span className="dot" /><span className="dot" /><span className="dot" /></span>
                    <span className="sr-only">Thinking…</span>
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
                  <div className="assistant-notice-actions">
                    {lastQuestion && (
                      <button type="button" className="text-link" onClick={() => {
                        setComposerText(lastQuestion);
                        setChatError("");
                        composerInputRef.current?.focus();
                      }}>Edit and resend</button>
                    )}
                    {/refresh|changed/i.test(chatError) && <button type="button" className="text-link" onClick={() => router.refresh()}>Refresh records</button>}
                  </div>
                </div>
              )}
            </ThreadPrimitive.Root>

            {(replyPending || replyError || replyProposal) && (
              <div className="assistant-tool-result">
                {replyPending && <p className="assistant-tool-status">Reading the reply…</p>}
                {replyError && (
                  <div role="alert" className="assistant-notice negative">
                    <p>{replyError}</p>
                    <button type="button" className="text-link" onClick={() => router.refresh()}>Refresh records</button>
                  </div>
                )}
                {replyProposal && replyProposal.task === "extract_reply" && (
                  <section tabIndex={-1} className="assistant-answer" aria-label="Extracted reply proposal">
                    <p className="assistant-answer-title">What the customer said</p>
                    <blockquote className="assistant-response">{sourceReplySaved}</blockquote>
                    <dl className="assistant-msg-facts">
                      <div><dt>Amount they&rsquo;ll pay</dt><dd className="num">{replyProposal.amountCents === null ? "Needs clarification" : formatPHP(replyProposal.amountCents)}</dd></div>
                      <div><dt>When</dt><dd>{replyProposal.date ? formatPlanDate(replyProposal.date) : "Needs clarification"}</dd></div>
                    </dl>
                    {replyProposal.reason && <p>{replyProposal.reason}</p>}
                    {replyProposal.needsReview && (
                      <div className="assistant-notice negative">
                        <p>Check the original reply first. It needs clarification or payment proof before anything is saved.</p>
                        <ul>{replyProposal.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
                      </div>
                    )}
                    <p className="assistant-answer-note">This is a promise, not cash received.</p>
                    {replyImpact && <CashImpact {...replyImpact} />}
                    {replyConfirmed && !replyStale && !replyReviewOpen && (
                      <button type="button" className="assistant-review-btn" onClick={() => setReplyReviewOpen(true)}>
                        Review receipt-plan fields
                      </button>
                    )}
                    {replyReviewOpen && replyConfirmed && !replyStale && (
                      <CollectionPanel
                        key={sourceReplySaved}
                        workspace={workspace}
                        invoice={proposalInvoice}
                        proposed={{ amountCents: replyProposal.amountCents!, date: replyProposal.date!, sourceNote: sourceReplySaved }}
                      />
                    )}
                  </section>
                )}
              </div>
            )}

            {(recordPending || recordError || recordProposal) && (
              <div className="assistant-tool-result">
                {recordPending && <p className="assistant-tool-status">Reading the details…</p>}
                {recordError && <div role="alert" className="assistant-notice negative"><p>{recordError}</p></div>}
                {recordProposal && (
                  <section className="assistant-review-panel" aria-label="Records found">
                    <p className="assistant-answer-title">
                      {recordProposal.proposals.length ? `Found ${recordProposal.proposals.length} ${recordProposal.proposals.length === 1 ? "record" : "records"}` : "No records found"}
                    </p>
                    {recordProposal.proposals.length === 0 ? (
                      <p className="muted">Check the details, or add the record by hand in Add records.</p>
                    ) : (
                      <div className="assistant-proposals-grid">
                        {recordProposal.proposals.map((item, index) => (
                          <div key={index} className={"assistant-draft-card" + (activeFormProposal === item ? " is-active" : "")}>
                            <p className="assistant-draft-kind">
                              {item.kind === "invoice" ? "Invoice" : "Bill"}
                              {item.kind === "invoice" && item.number ? ` · ${item.number}` : ""}
                              {item.kind === "expense" && item.label ? ` · ${item.label}` : ""}
                            </p>
                            <p className="assistant-record-line">
                              <strong>{item.party ?? "No name found"}</strong>
                              <span className="num">{item.amountCents !== null ? formatPHP(item.amountCents) : "Amount needs check"}</span>
                              <span>{item.dueDate ? `Due ${formatPlanDate(item.dueDate)}` : "Due date needs check"}</span>
                            </p>
                            {item.sourceQuotes.length > 0 && <blockquote className="assistant-response">{item.sourceQuotes.join(" ")}</blockquote>}
                            {item.issues.length > 0 && <ul className="assistant-issues">{item.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
                            {activeFormProposal !== item && (
                              <button type="button" className="assistant-review-btn" onClick={() => setActiveFormProposal(item)}>
                                Open in form
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {activeFormProposal && (
                      <div className="panel proposal-review-panel" key={recordProposal.proposals.indexOf(activeFormProposal)}>
                        <div className="assistant-draft-header">
                          <div>
                            <strong>Check and save this {activeFormProposal.kind === "invoice" ? "invoice" : "bill"}</strong>
                            <p className="muted">Nothing is saved until you press the button below.</p>
                          </div>
                          <button type="button" className="text-link" onClick={() => setActiveFormProposal(null)}>Close form</button>
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
                              <details className="add-entry-more" open={!activeFormProposal.customerId}>
                                <summary>{activeFormProposal.party ? `Add customer "${activeFormProposal.party}"` : "Customer not listed? Add a customer"}</summary>
                                <CustomerForm workspace={workspace} initialName={activeFormProposal.party ?? undefined} />
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
            )}
          </div>
        </div>

        <footer className="assistant-composer-wrap">
          <ComposerPrimitive.Root className="assistant-composer-root" onSubmit={submitComposer}>
            {contextLabel && !tool && (
              <AssistantContextChip label={contextLabel} disabled={busy} onClear={clearContext} />
            )}
            {tool && (
              <div className="assistant-tool-card" role="group" aria-label={toolLabel}>
                <div className="assistant-tool-card-head">
                  <strong>{toolLabel}</strong>
                  <button type="button" className="assistant-tool-close" aria-label={"Stop: " + toolLabel} onClick={closeTool} disabled={busy}>×</button>
                </div>
                {tool !== "add_record" && (
                  <label className="assistant-tool-field">
                    <span>Invoice</span>
                    <select ref={tool === "reply" ? replyPicker : undefined} className="field" value={toolInvoice} disabled={busy} required
                      onChange={event => setToolInvoice(event.target.value)}>
                      <option value="">Choose an unpaid invoice</option>
                      {openInvoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number}</option>)}
                    </select>
                  </label>
                )}
                <p className="assistant-tool-hint">{toolHint}</p>
              </div>
            )}
            <div className="assistant-composer-card">
              <textarea
                ref={composerInputRef}
                className="field assistant-composer-input assistant-composer-textarea"
                rows={1}
                aria-label={tool === "reply" ? "Customer's reply" : tool === "add_record" ? "Record details" : "Your message"}
                placeholder={placeholder}
                maxLength={mode === "reply" ? 4000 : 1000}
                value={composerValue}
                disabled={busy}
                onChange={event => setComposerValue(event.target.value)}
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
                    disabled={busy}
                    onClick={() => { setFocusedMenuIndex(0); setToolsOpen(!toolsOpen); }}
                  >
                    <DashboardIcon name="plus" size={14} />Tools
                  </button>
                  {toolsOpen && (
                    <div ref={menuRef} className="assistant-tools-menu" role="menu" aria-label="Workspace tools" onKeyDown={handleMenuKeyDown}>
                      {WORKSPACE_TOOLS.map((item, index) => (
                        <button key={item.id} type="button" role="menuitem" tabIndex={focusedMenuIndex === index ? 0 : -1}
                          className="assistant-tools-item" onClick={() => selectTool(item.id)}>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="assistant-send-btn"
                  disabled={!composerValue.trim() || busy}
                  aria-label="Send message"
                >
                  <span className="assistant-send-label">Send</span>
                  <DashboardIcon name="arrowRight" size={14} />
                </button>
              </div>
            </div>
          </ComposerPrimitive.Root>

          <div className="assistant-footnote">
            <label className="assistant-lang">
              <span>Reply in</span>
              <select className="assistant-lang-select" value={language} aria-label="Response language"
                onChange={(e) => setLanguage(e.target.value as AiRequest["language"])}>
                <option value="auto">Match my language</option>
                <option value="english">English</option>
                <option value="tagalog">Tagalog</option>
                <option value="taglish">Taglish</option>
              </select>
            </label>
            <p>Messages are processed externally by Gemini, with OpenAI as a backup. Use fictional data only. Manual entry works without AI.</p>
          </div>
        </footer>
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
