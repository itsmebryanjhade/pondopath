import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandError } from "../domain/commands";
const mocks = vi.hoisted(() => ({ run: vi.fn(), revalidate: vi.fn(), rethrow: vi.fn() }));
vi.mock("@/lib/server/commands", () => ({ runCommand: mocks.run }));
vi.mock("@/lib/server/auth", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: mocks.rethrow }));
import { executeWorkspaceAction } from "../../app/(workspace)/actions";
const input = {
  requestId: randomUUID(),
  expectedRevision: 3,
  type: "save_expense",
  payload: { label: "Payroll", payee: "Employees", amountCents: 5_000_000, dueDate: "2026-10-30" },
};

describe("workspace action boundary", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects invalid money and authority overrides before executing", async () => {
    expect(
      await executeWorkspaceAction({
        ...input,
        payload: { ...input.payload, amountCents: 0, role: "owner" },
      }),
    ).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("passes the unchanged request to the authorized command and refreshes the workspace after success", async () => {
    const data = { revision: 4, recordId: randomUUID(), replayed: false };
    mocks.run.mockResolvedValue(data);
    expect(await executeWorkspaceAction(input)).toEqual({ ok: true, data });
    expect(mocks.run).toHaveBeenCalledWith(input);
    expect(mocks.revalidate.mock.calls).toEqual([["/(workspace)", "layout"]]);
  });
  it("returns a recoverable conflict without claiming a save", async () => {
    mocks.run.mockRejectedValue(new CommandError("STALE_VERSION"));
    expect(await executeWorkspaceAction(input)).toMatchObject({ ok: false, code: "STALE_VERSION" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("hides internal and network errors so the same request can be retried", async () => {
    mocks.run.mockRejectedValue(new Error("private database host and token"));
    const result = await executeWorkspaceAction(input);
    expect(result).toMatchObject({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("private database");
  });
  it("preserves the framework's redirect to sign-in", async () => {
    const redirect = new Error("redirect sentinel");
    mocks.run.mockRejectedValue(redirect);
    mocks.rethrow.mockImplementation((error) => {
      throw error;
    });
    await expect(executeWorkspaceAction(input)).rejects.toBe(redirect);
  });
});
