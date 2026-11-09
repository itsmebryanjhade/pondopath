import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  role: "owner" as "owner" | "finance",
  sources: [] as { id: string; kind: string; business_id: string; created_at: string }[],
  rpc: vi.fn(),
  filters: [] as unknown[],
}));
const businessId = "10000000-0000-4000-8000-000000000002";
vi.mock("@/lib/server/auth", () => ({ requireActor: async () => ({ role: mocks.role, userId: "10000000-0000-4000-8000-000000000001", businessId }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: mocks.rpc,
  from: () => {
    let kinds: string[] = [];
    let business = "";
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { if (key === "business_id") business = value; return query; },
      in: (_key: string, values: string[]) => { kinds = values; return query; },
      order: () => query,
      limit: async () => ({ data: mocks.sources.filter(source => source.business_id === business && kinds.includes(source.kind)).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 1), error: null }),
    };
    return query;
  },
}) }));
import { CommandError } from "@/lib/domain/commands";
import { ensureFileSource } from "./file-source";

const source = (id: string, kind: string, created_at: string) => ({ id, kind, business_id: businessId, created_at });
beforeEach(() => { vi.resetAllMocks(); mocks.role = "owner"; mocks.sources = []; });

describe("default file source", () => {
  it("reuses the first manual_csv or manual_xlsx source", async () => {
    mocks.sources = [source("b", "manual_xlsx", "2026-11-02"), source("a", "manual_csv", "2026-11-01")];
    expect(await ensureFileSource()).toBe("a");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("an owner creates \"Uploaded files\" when none exists", async () => {
    mocks.rpc.mockImplementation(async () => { mocks.sources.push(source("new", "manual_csv", "2026-11-07")); return { data: "new", error: null }; });
    expect(await ensureFileSource()).toBe("new");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_intake_source", { p_kind: "manual_csv", p_label: "Uploaded files" });
  });
  it("converges on the earliest source if another upload created one at the same time", async () => {
    mocks.rpc.mockImplementation(async () => { mocks.sources.push(source("late", "manual_csv", "2026-11-07T10:00:01"), source("early", "manual_csv", "2026-11-07T10:00:00")); return { data: "late", error: null }; });
    expect(await ensureFileSource()).toBe("early");
  });
  it("a finance teammate gets a friendly refusal when none exists", async () => {
    mocks.role = "finance";
    const failure = await ensureFileSource().then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(CommandError);
    expect(Object.values((failure as CommandError).fieldErrors ?? {})[0]).toBe("Ask the owner to add the first file.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("lets a finance teammate use an existing source", async () => {
    mocks.role = "finance";
    mocks.sources = [source("a", "manual_csv", "2026-11-01")];
    expect(await ensureFileSource()).toBe("a");
  });
  it("ignores sources of other kinds", async () => {
    mocks.sources = [source("g", "google_sheet", "2026-11-01"), source("d", "drive_file", "2026-11-01")];
    mocks.rpc.mockImplementation(async () => { mocks.sources.push(source("new", "manual_csv", "2026-11-07")); return { data: "new", error: null }; });
    expect(await ensureFileSource()).toBe("new");
  });
});
