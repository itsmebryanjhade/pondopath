import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiAssistant } from "@/components/ai-assistant";
import { AiContextButton, ASSISTANT_OPEN_EVENT } from "@/components/ai-context-button";
import InvoiceDetail from "@/app/(workspace)/invoices/[id]/page";
import { executeWorkspaceAction } from "@/app/(workspace)/actions";
import { assistantContextMatchesPath, assistantContextProblem, assistantContextWorkspace, type AssistantContextEntry } from "./assistant-chat-adapter";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

const state = vi.hoisted(() => ({
  pathname: "/followups",
  workspace: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: state.notFound,
}));
vi.mock("@/lib/server/workspace", () => ({
  getWorkspace: state.workspace,
  getCashMovements: async () => [],
  getRecordHistory: async () => ({ events: [], nextCursor: null }),
}));
vi.mock("@/app/(workspace)/actions", () => ({
  executeWorkspaceAction: vi.fn(),
  getApprovedReminderText: vi.fn(),
}));

function followupEntry(workspace = uiWorkspace()): AssistantContextEntry {
  return {
    context: { page: "followups", record: { kind: "invoice", id: workspace.invoices[0].id } },
    workspace,
    starterText: "Help me follow up on this invoice",
    intent: "draft_followup",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("contextual assistant entry", () => {
  it("opens with the exact entry from a normal button without calling the assistant or saving", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const entry = followupEntry();
    const button = AiContextButton({ entry, children: "Prepare follow-up with AI" });
    const trigger = new EventTarget();
    const received = vi.fn();
    trigger.addEventListener(ASSISTANT_OPEN_EVENT, received);
    expect(button.props.type).toBe("button");
    button.props.onClick({ currentTarget: trigger });
    expect(received).toHaveBeenCalledOnce();
    expect(received.mock.calls[0][0].detail).toEqual(entry);
    expect(fetcher).not.toHaveBeenCalled();
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });

  it("prefills the shared assistant and the exact follow-up invoice for finance staff", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const workspace = uiWorkspace();
    workspace.actor.role = "finance";
    const html = renderToStaticMarkup(createElement(AiAssistant, {
      workspace, dialog: createRef<HTMLDialogElement>(), onClose: () => {},
      initialEntry: followupEntry(workspace),
    }));
    expect(html).toMatch(/<textarea[^>]*>Help me follow up on this invoice<\/textarea>/);
    expect(html).not.toContain("Remove context:");
    expect(html).toContain(`value="${workspace.invoices[0].id}" selected=""`);
    expect(fetcher).not.toHaveBeenCalled();
    expect(executeWorkspaceAction).not.toHaveBeenCalled();
  });

  it("renders the named record in a removable chip for a scoped question", () => {
    const workspace = uiWorkspace();
    const invoice = workspace.invoices[0];
    const props = { workspace, dialog: createRef<HTMLDialogElement>(), onClose: () => {} };
    const html = renderToStaticMarkup(createElement(AiAssistant, {
      ...props,
      initialEntry: {
        workspace,
        context: { page: "invoices", record: { kind: "invoice", id: invoice.id } },
        starterText: "Explain this outstanding balance",
      },
    }));
    expect(html).toContain('aria-label="This question is about"');
    expect(html).toContain('aria-label="Remove context: Invoice ' + invoice.number + '"');
    expect(html).toContain("Explain this outstanding balance");
    expect(renderToStaticMarkup(createElement(AiAssistant, props))).not.toContain("Remove context:");
  });

  it("checks the route invoice, workspace membership, and the original revision", () => {
    const workspace = uiWorkspace();
    workspace.actor.role = "finance";
    const invoice = workspace.invoices[0];
    const entry: AssistantContextEntry = {
      ...followupEntry(workspace),
      context: { page: "invoices", record: { kind: "invoice", id: invoice.id } },
      intent: undefined,
    };
    const path = `/invoices/${invoice.id}`;
    expect(assistantContextProblem(entry, path, workspace)).toBeUndefined();
    expect(assistantContextProblem(entry, "/invoices/another", workspace)).toMatch(/invoice/i);
    expect(assistantContextProblem(entry, "/forecast", workspace)).toMatch(/page/i);
    expect(assistantContextProblem(entry, path, { ...workspace, invoices: [] })).toMatch(/invoice/i);
    expect(assistantContextProblem(entry, path, { ...workspace, revision: workspace.revision + 1 })).toMatch(/records changed/i);
  });

  it("uses a fresh card snapshot when the shared layout is behind, scoped to the signed-in actor", () => {
    const layout = uiWorkspace();
    const latest = {
      ...layout, revision: layout.revision + 1,
      invoices: [{ ...layout.invoices[0], id: "00000000-0000-4000-8000-000000000089" }],
    };
    const id = latest.invoices[0].id;
    const entry = {
      ...followupEntry(layout), workspace: latest,
      context: { page: "invoices", record: { kind: "invoice", id } },
    } as const;
    const path = "/invoices/" + id;
    const workspace = assistantContextWorkspace(entry.workspace, layout);
    expect(workspace).toBe(latest);
    expect(assistantContextWorkspace(layout, workspace)).toBe(latest);
    expect(assistantContextProblem(entry, path, workspace)).toBeUndefined();
    expect(assistantContextMatchesPath(entry, "/followups")).toBe(false);
    expect(assistantContextMatchesPath(entry, "/invoices/" + layout.invoices[0].id)).toBe(false);
    const anotherActor = { ...layout, actor: { ...layout.actor, userId: "different-user" } };
    expect(assistantContextWorkspace(entry.workspace, anotherActor)).toBe(anotherActor);
    expect(assistantContextProblem(entry, path, anotherActor)).toMatch(/workspace/i);
  });

  it("puts the invoice action in the authorized invoice balance panel", async () => {
    const workspace = uiWorkspace();
    state.workspace.mockResolvedValue(workspace);
    const render = (id: string) => InvoiceDetail({
      params: Promise.resolve({ id }), searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(await render(workspace.invoices[0].id));
    const action = html.match(/aria-label="Invoice balance"[\s\S]*?(<button[^>]+aria-haspopup="dialog"[^>]*>[\s\S]*?<\/button>)/)?.[1];
    expect(action).toContain("Explain this balance");
    await expect(render("00000000-0000-4000-8000-000000000099")).rejects.toThrow("NOT_FOUND");
  });
});
