import { describe, expect, it } from "vitest";
import {
  generatePageStarters,
  generateMockReply,
  createIsolatedChatModelAdapter,
  trimChatHistory,
} from "./assistant-chat-adapter";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";

describe("assistant-chat-adapter", () => {
  it("provides 3 page-aware starters based on pathname", () => {
    const overviewStarters = generatePageStarters("/overview");
    expect(overviewStarters).toHaveLength(3);
    expect(overviewStarters[0]).toBe("What should I do first?");

    const forecastStarters = generatePageStarters("/forecast");
    expect(forecastStarters).toHaveLength(3);
    expect(forecastStarters[0]).toContain("projected shortage");

    const invoicesStarters = generatePageStarters("/invoices");
    expect(invoicesStarters).toHaveLength(3);
    expect(invoicesStarters[0]).toContain("customer owes the most");

    const expensesStarters = generatePageStarters("/expenses");
    expect(expensesStarters).toHaveLength(3);
    expect(expensesStarters[0]).toContain("bills are due");

    const followupsStarters = generatePageStarters("/followups");
    expect(followupsStarters).toHaveLength(3);
    expect(followupsStarters[0]).toContain("follow-ups are overdue");
  });

  it("generates deterministic mock replies for cash questions with verified facts", () => {
    const workspace = uiWorkspace();
    const reply = generateMockReply("Explain our cash shortage", workspace);
    expect(reply.text).toBeDefined();
    expect(reply.sourceRevision).toBe(workspace.revision);
    expect(reply.facts).toBeDefined();
    expect(reply.facts?.some((f) => f.label === "Recorded available cash")).toBe(true);
    expect(reply.sources).toBeDefined();
  });

  it("generates draft reminder proposal when requested with matching source revision", () => {
    const workspace = uiWorkspace();
    const reply = generateMockReply("Draft a reminder for DEMO-001", workspace);
    expect(reply.draft?.kind).toBe("reminder");
    expect(reply.draft?.invoiceId).toBe(workspace.invoices[0].id);
    expect(reply.draft?.suggestedBody).toContain("DEMO-001");
    expect(reply.draft?.sourceRevision).toBe(workspace.revision);
  });

  it("generates follow-up task draft proposal when requested", () => {
    const workspace = uiWorkspace();
    const reply = generateMockReply("Plan a follow-up task", workspace);
    expect(reply.draft?.kind).toBe("followup");
    expect(reply.draft?.invoiceId).toBe(workspace.invoices[0].id);
    expect(reply.draft?.sourceRevision).toBe(workspace.revision);
  });

  it("creates an isolated chat model adapter conforming to useLocalRuntime", async () => {
    const workspace = uiWorkspace();
    const adapter = createIsolatedChatModelAdapter(workspace);
    const generator = adapter.run({
      messages: [{ role: "user", content: [{ type: "text", text: "How much cash do we have?" }] }],
    });
    const result = await generator.next();
    expect(result.done).toBe(false);
    if (!result.done && result.value) {
      expect(result.value.content[0].text).toBeDefined();
    }
  });

  it("terminates immediately when abortSignal is triggered", async () => {
    const workspace = uiWorkspace();
    const adapter = createIsolatedChatModelAdapter(workspace);
    const controller = new AbortController();
    controller.abort();

    const generator = adapter.run({
      messages: [{ role: "user", content: [{ type: "text", text: "How much cash do we have?" }] }],
      abortSignal: controller.signal,
    });
    const result = await generator.next();
    expect(result.done).toBe(true);
  });

  describe("trimChatHistory", () => {
    it("trims chat history to the latest 3 completed question/answer pairs", () => {
      const messages = [
        { role: "user", text: "Q1" },
        { role: "assistant", text: "A1" },
        { role: "user", text: "Q2" },
        { role: "assistant", text: "A2" },
        { role: "user", text: "Q3" },
        { role: "assistant", text: "A3" },
        { role: "user", text: "Q4" },
        { role: "assistant", text: "A4" },
      ];
      const trimmed = trimChatHistory(messages, 3);
      expect(trimmed).toHaveLength(3);
      expect(trimmed[0]).toEqual({ question: "Q2", answer: "A2" });
      expect(trimmed[1]).toEqual({ question: "Q3", answer: "A3" });
      expect(trimmed[2]).toEqual({ question: "Q4", answer: "A4" });
    });

    it("ignores incomplete trailing user question without assistant answer", () => {
      const messages = [
        { role: "user", text: "Q1" },
        { role: "assistant", text: "A1" },
        { role: "user", text: "Incomplete Question" },
      ];
      const trimmed = trimChatHistory(messages, 3);
      expect(trimmed).toHaveLength(1);
      expect(trimmed[0]).toEqual({ question: "Q1", answer: "A1" });
    });

    it("trims oldest pairs further if total bytes exceed max limit", () => {
      const longText = "x".repeat(300);
      const messages = [
        { role: "user", text: "Q1" },
        { role: "assistant", text: longText },
        { role: "user", text: "Q2" },
        { role: "assistant", text: longText },
        { role: "user", text: "Q3" },
        { role: "assistant", text: "Short" },
      ];
      // Limit to 400 bytes, which fits Q3 + maybe Q2
      const trimmed = trimChatHistory(messages, 3, 400);
      expect(trimmed.length).toBeLessThan(3);
      expect(trimmed[trimmed.length - 1].question).toBe("Q3");
    });
  });
});
