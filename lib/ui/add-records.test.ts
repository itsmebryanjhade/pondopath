import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(workspace)/imports/actions", () => ({ ensureFileSourceAction: vi.fn(), inspectCsvAction: vi.fn(), previewCsvAction: vi.fn(), stageCsvAction: vi.fn() }));
import { AddRecords, canSend, countNew, describeFailure, needsAttention } from "@/components/add-records";

const BANNED = /KiB|UTF|row ID|YYYY|source/i;
const visibleText = (markup: string) => markup.replace(/<[^>]+>/g, " ");

describe("Add records flow", () => {
  it("starts on the File step with the three choices", () => {
    const markup = renderToStaticMarkup(createElement(AddRecords, { customers: [], googleSlot: createElement("p", null, "google panel") })).replaceAll("&#x27;", "'");
    expect(markup).toMatch(/aria-current="step"[^>]*>[\s\S]*?File/);
    for (const text of ["Drop your Excel or CSV file here", "Connect Google Sheet", "Type it in"]) expect(markup).toContain(text);
    expect(markup).not.toContain("google panel");
    expect(visibleText(markup)).not.toMatch(BANNED);
  });
  it("passes the owner message through and makes other failures plain", () => {
    expect(describeFailure("Ask the owner to add the first file.")).toBe("Ask the owner to add the first file.");
    expect(describeFailure("Choose a .csv or .xlsx file up to 512 KiB.")).toBe("That file is too big, or isn't Excel or CSV. Export fewer rows and try again.");
    expect(describeFailure("weird")).toMatch(/couldn't read that file/);
  });
  it("Send is disabled while busy and for zero rows", () => {
    expect(canSend({ busy: false, rows: 3 })).toBe(true);
    expect(canSend({ busy: true, rows: 3 })).toBe(false);
    expect(canSend({ busy: false, rows: 0 })).toBe(false);
  });
  it("opens the check panel only when something needs the person", () => {
    const fields = { externalId: "Ref", amount: "Amount" };
    const labels = [{ row: 2, externalId: "A", label: "invoice" as const, reason: "" }];
    expect(needsAttention({ fields, labels, customers: 1 })).toBe(false);
    expect(needsAttention({ fields: { amount: "Amount" }, labels, customers: 1 })).toBe(true);
    expect(needsAttention({ fields, labels: [{ ...labels[0], label: "choose" as const }], customers: 1 })).toBe(true);
    expect(needsAttention({ fields, labels, customers: 2 })).toBe(true);
    expect(needsAttention({ fields, labels: [{ ...labels[0], label: "expense" as const }], customers: 2 })).toBe(false);
  });
  it("counts only new rows, so re-sending a file is calm", () => {
    const results = [
      { externalId: "A", status: "pending", replayed: false },
      { externalId: "B", status: "needs_match", replayed: false },
      { externalId: "C", status: "pending", replayed: true },
      { externalId: "D", status: "invalid", replayed: false },
    ];
    expect(countNew(results)).toEqual({ fresh: 2, already: 1 });
  });
});
