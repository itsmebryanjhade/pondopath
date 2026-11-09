import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireActor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("./auth", () => ({ requireActor: mocks.requireActor }));
import { runCommand } from "./commands";

const envelope = { requestId: randomUUID(), expectedRevision: 3 };
const result = { revision: 4, recordId: randomUUID(), replayed: false };

describe("runCommand routing", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.rpc.mockResolvedValue({ data: result, error: null }); });

  it("sends delete commands to the dedicated delete function", async () => {
    const command = { ...envelope, type: "delete_invoice" as const, payload: { id: randomUUID(), reason: "Entered by mistake" } };
    await expect(runCommand(command)).resolves.toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_workspace_record", { p_command: command });
  });

  it("keeps sending every other command to the normal dispatcher", async () => {
    const command = { ...envelope, type: "set_opening_cash" as const, payload: { amountCents: 0, date: "2026-10-26" } };
    await runCommand(command);
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_command", { p_command: command });
  });

  it("surfaces the has-payments refusal instead of a generic failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "HAS_PAYMENTS" } });
    const command = { ...envelope, type: "delete_expense" as const, payload: { id: randomUUID(), reason: "Entered by mistake" } };
    await expect(runCommand(command)).rejects.toMatchObject({ code: "HAS_PAYMENTS" });
  });
});
