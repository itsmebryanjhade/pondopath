import { beforeEach, describe, expect, it, vi } from "vitest";
import { uiWorkspace } from "../../tests/fixtures/ui-workspace";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), rpc: vi.fn(), config: vi.fn(), provider: vi.fn() }));
vi.mock("./workspace", () => ({ getWorkspace: mocks.workspace }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("./ai-provider", () => ({ aiConfig: mocks.config, callAiProvider: mocks.provider }));
import { requestAssistant } from "./ai";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue(uiWorkspace());
  mocks.config.mockReturnValue({ key: "test-only", model: "test-model", provider: "test-provider" });
  mocks.provider.mockResolvedValue({ value: { summary: "Expected pa lang ang bayad.", recordIds: [] }, usage: { cost: null } });
});
const input = { task: "explain", question: "May cash gap ba?", expectedRevision: 1 };
describe("authorized AI orchestration", () => {
  it("reserves before inference, then validates against a fresh authorized snapshot", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: uiWorkspace() });
    expect(await requestAssistant(input)).toMatchObject({ proposal: { sourceRevision: 1, task: "explain" } });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["reserve_ai_request", "workspace_snapshot"]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.provider.mock.invocationCallOrder[0]);
  });
  it("does not spend a request on stale, foreign, non-demo or unconfigured requests", async () => {
    await expect(requestAssistant({ ...input, expectedRevision: 0 })).rejects.toThrow("STALE_VERSION");
    await expect(requestAssistant({ ...input, invoiceId: "10000000-0000-4000-8000-000000000099" })).rejects.toThrow("NOT_FOUND");
    mocks.workspace.mockResolvedValueOnce({ ...uiWorkspace(), business: { ...uiWorkspace().business, is_demo: false } });
    await expect(requestAssistant(input)).rejects.toThrow("AI_DEMO_ONLY");
    mocks.config.mockImplementationOnce(() => { throw new Error("AI_UNAVAILABLE"); });
    await expect(requestAssistant(input)).rejects.toThrow("AI_UNAVAILABLE");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("blocks a request when the allowance is exhausted and discards changes during inference", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: { message: "AI_LIMIT" } });
    await expect(requestAssistant(input)).rejects.toThrow("AI_LIMIT");
    expect(mocks.provider).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: { ...uiWorkspace(), revision: 2 } });
    await expect(requestAssistant(input)).rejects.toThrow("STALE_VERSION");
  });
});
