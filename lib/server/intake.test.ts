import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), actor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/server/auth", () => ({ requireActor: mocks.actor }));
import { confirmSelectedIntake, isBulkConfirmable, type IntakeItem } from "./intake";
const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
const items = ids.map(id => ({ id, reviewVersion: 1 }));
beforeEach(() => { vi.resetAllMocks(); mocks.actor.mockResolvedValue({ userId: ids[0], businessId: ids[1], role: "finance" }); });
describe("bulk intake confirmation", () => {
  it("rejects 51 items and duplicate ids before any apply", async () => {
    for (const selected of [Array.from({ length: 51 }, () => ({ id: randomUUID(), reviewVersion: 1 })), [items[0], items[0]]]) {
      await expect(confirmSelectedIntake({ items: selected, revision: 4 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects empty selections and invalid versions, revisions or extra scope", async () => {
    for (const input of [{ items: [], revision: 0 }, { items, revision: -1 }, { items: [{ ...items[0], reviewVersion: 0 }], revision: 0 }, { items, revision: 0, businessId: ids[0] }]) {
      await expect(confirmSelectedIntake(input)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("isolates a stale second item and chains the third from the first success without retrying", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { revision: 8, recordId: ids[0], replayed: false }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "STALE_VERSION" } })
      .mockResolvedValueOnce({ data: { revision: 9, recordId: ids[2], replayed: false }, error: null });
    expect(await confirmSelectedIntake({ items, revision: 7 })).toEqual({ confirmed: [ids[0], ids[2]], failed: [{ id: ids[1], code: "STALE_VERSION" }], revision: 9 });
    expect(mocks.actor).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls).toEqual(items.map((item, index) => ["apply_intake", { p_item_id: item.id, p_review_version: 1, p_expected_revision: index === 0 ? 7 : 8 }]));
  });
  it("continues safely after an unavailable response without advancing the revision or exposing its details", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("private transport details"))
      .mockResolvedValueOnce({ data: { revision: 2 }, error: null })
      .mockResolvedValueOnce({ data: { revision: 3, recordId: ids[2], replayed: false }, error: null });
    expect(await confirmSelectedIntake({ items, revision: 2 })).toEqual({ confirmed: [ids[2]], failed: [{ id: ids[0], code: "SERVICE_UNAVAILABLE" }, { id: ids[1], code: "SERVICE_UNAVAILABLE" }], revision: 3 });
    expect(mocks.rpc.mock.calls.every(call => call[1].p_expected_revision === 2)).toBe(true);
  });
  it("recognizes only pending, parseable proposals", () => {
    const item: IntakeItem = { id: ids[0], business_id: ids[1], source_id: ids[2], external_id: "bulk-clean", source_version: "1",
      status: "pending", candidate: { type: "save_expense", payload: { label: "Bill", payee: "Vendor", amountCents: 100, dueDate: "2026-11-10" } },
      original_content: {}, current_values: null, matched_record_id: null, matched_version: null, review_version: 1,
      observed_at: "2026-11-07T00:00:00Z", staged_by: ids[0], reviewed_by: null, reviewed_at: null, review_note: null, outcome: null, source_evidence: {} };
    expect(isBulkConfirmable(item)).toBe(true);
    expect(isBulkConfirmable({ ...item, status: "needs_match" })).toBe(false);
    expect(isBulkConfirmable({ ...item, candidate: {} })).toBe(false);
  });
});
