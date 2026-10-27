import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  client: vi.fn(),
  movements: vi.fn(),
  revision: vi.fn(),
  history: vi.fn(),
  eq: vi.fn().mockReturnThis(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth", () => ({ requireActor: mocks.actor }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { getCashMovements, getRecordHistory } from "./workspace";

describe("consistent payment reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.actor.mockResolvedValue({
      businessId: "current-business",
      userId: "current-user",
      role: "finance",
    });
    const paymentQuery = {
      select: vi.fn().mockReturnThis(),
      eq: mocks.eq.mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: mocks.movements,
    };
    const businessQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: mocks.revision,
    };
    mocks.client.mockResolvedValue({
      from: (name: string) => (name === "cash_movements" ? paymentQuery : businessQuery),
      rpc: mocks.history,
    });
    mocks.movements.mockResolvedValue({ data: [{ id: "recorded-payment" }], error: null });
    mocks.revision.mockResolvedValue({ data: { revision: 7 }, error: null });
    mocks.history.mockResolvedValue({ data: { events: [], nextCursor: null }, error: null });
  });
  it("returns payments only when they belong to the displayed snapshot revision", async () => {
    await expect(getCashMovements("receipt", 7, "invoice-id")).resolves.toEqual([
      { id: "recorded-payment" },
    ]);
  });
  it("requires a retry instead of mixing a newer payment list with an older balance", async () => {
    mocks.revision.mockResolvedValue({ data: { revision: 8 }, error: null });
    await expect(getCashMovements("receipt", 7, "invoice-id")).rejects.toThrow();
  });
  it("does not query payments when current membership cannot be established", async () => {
    mocks.actor.mockRejectedValue(new Error("Sign-in required"));
    await expect(getCashMovements("expense_payment", 7)).rejects.toThrow("Sign-in required");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("scopes an older retained payment to the business, invoice and selected movement", async () => {
    await getCashMovements("receipt", 7, "invoice-id", "older-payment");
    expect(mocks.eq.mock.calls).toEqual([
      ["business_id", "current-business"],
      ["kind", "receipt"],
      ["invoice_id", "invoice-id"],
      ["id", "older-payment"],
    ]);
  });
  it("rejects history that changed after the displayed snapshot was read", async () => {
    mocks.revision.mockResolvedValue({ data: { revision: 8 }, error: null });
    await expect(getRecordHistory("invoice", "invoice-id", undefined, 7)).rejects.toThrow();
  });
});
