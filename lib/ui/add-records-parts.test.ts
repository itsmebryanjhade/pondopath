import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { CheckSummary, ChoiceCards, DoneState, DropArea, ManualLinks, StepIndicator } from "@/components/add-records-parts";

const BANNED = /KiB|UTF|row ID|YYYY|source/i;
const html = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element).replaceAll("&#x27;", "'");
const visibleText = (markup: string) => markup.replace(/<[^>]+>/g, " ");

describe("Add records building blocks", () => {
  it("StepIndicator marks the current step and completed steps", () => {
    const markup = html(createElement(StepIndicator, { step: "check" }));
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-current="step"[^>]*>[\s\S]*?Check/);
    for (const label of ["File", "Check", "Done"]) expect(markup).toContain(label);
    expect(markup).toContain('<span>File</span><span class="sr-only">, done</span>');
    expect(markup).not.toContain('<span>Check</span><span class="sr-only">');
  });
  it("DropArea is labelled, offers Choose file and accepts only Excel and CSV", () => {
    const markup = html(createElement(DropArea, { onFile: vi.fn() }));
    expect(markup).toContain("Drop your Excel or CSV file here");
    expect(markup).toContain("Choose file");
    expect(markup).toMatch(/accept="[^"]*\.csv[^"]*\.xlsx[^"]*"/);
    expect(markup).toMatch(/<button[^>]*type="button"/);
    expect(markup).toContain("Try a sample file");
    expect(visibleText(markup)).not.toMatch(BANNED);
  });
  it("DropArea shows the release message and file name while dragging", () => {
    const markup = html(createElement(DropArea, { onFile: vi.fn(), dragging: true, fileName: "sales-november.xlsx" }));
    expect(markup).toContain("Release to add your file");
    expect(markup).toContain("sales-november.xlsx");
  });
  it("CheckSummary shows the sentence, the held note and at most five preview rows", () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ cells: [`INV-${index}`, "15000"], label: index % 2 ? "expense" as const : "invoice" as const }));
    const markup = html(createElement(CheckSummary, { summary: "We found 4 invoices and 4 expenses.", held: "2 payments aren't imported.", headers: ["Ref", "Amount"], rows }));
    expect(markup).toContain("We found 4 invoices and 4 expenses.");
    expect(markup).toContain("2 payments aren't imported.");
    expect(markup.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr/g)).toHaveLength(5);
    expect(markup).toContain("Invoice");
    expect(markup).toContain("Expense");
  });
  it("CheckSummary hides the held note when there is nothing to say", () => {
    expect(html(createElement(CheckSummary, { summary: "We found 1 invoice.", held: "", headers: ["Ref"], rows: [{ cells: ["A"], label: "invoice" }] }))).not.toContain("add-note");
  });
  it("DoneState says nothing is saved yet exactly once and links to review", () => {
    const markup = html(createElement(DoneState, { count: 15, reviewHref: "/imports", onAddMore: vi.fn() }));
    expect(markup).toContain("15 rows are ready to review");
    expect(markup.match(/Nothing is saved yet/g)).toHaveLength(1);
    expect(markup).toMatch(/href="\/imports"[^>]*>Review now/);
    expect(markup).toContain("Add more records");
    expect(html(createElement(DoneState, { count: 1, reviewHref: "/imports", onAddMore: vi.fn() }))).toContain("1 row is ready to review");
  });
  it("ChoiceCards offers Connect Google Sheet and Type it in as toggles that report their state", () => {
    const closed = html(createElement(ChoiceCards, { googleOpen: false, onConnectGoogle: vi.fn(), manualOpen: false, onManual: vi.fn() }));
    expect(closed).toContain("Connect Google Sheet");
    expect(closed).toContain("Type it in");
    expect(closed.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(closed).not.toContain("href=");
    const open = html(createElement(ChoiceCards, { googleOpen: false, onConnectGoogle: vi.fn(), manualOpen: true, onManual: vi.fn() }));
    expect(open.match(/aria-expanded="true"/g)).toHaveLength(1);
  });
  it("ManualLinks keeps the old Quick add shortcuts in plain words", () => {
    const markup = html(createElement(ManualLinks));
    expect(markup).toMatch(/href="\/invoices#new-invoice"[^>]*>[\s\S]*?Add an invoice/);
    expect(markup).toMatch(/href="\/expenses#new-expense"[^>]*>[\s\S]*?Add an expense/);
    expect(markup).toMatch(/href="\/invoices\?filter=unpaid"[^>]*>[\s\S]*?Record a payment you received/);
    expect(visibleText(markup)).not.toMatch(/verified|Quick add/i);
  });
  it("marks where focus goes after each step change", () => {
    const check = html(createElement(CheckSummary, { summary: "We found 1 invoice.", held: "", headers: ["Ref"], rows: [{ cells: ["A"], label: "invoice" }] }));
    expect(check).toMatch(/<p[^>]*class="add-summary"[^>]*tabindex="-1"[^>]*data-step-focus|<p[^>]*data-step-focus[^>]*tabindex="-1"/i);
    const done = html(createElement(DoneState, { count: 2, reviewHref: "/imports", onAddMore: vi.fn() }));
    expect(done).toMatch(/<h2[^>]*tabindex="-1"/i);
    expect(done).toContain("data-step-focus");
    expect(done).toContain('role="status"');
  });
  it("DoneState mentions skipped rows once when there are some", () => {
    expect(html(createElement(DoneState, { count: 4, reviewHref: "/imports", onAddMore: vi.fn(), skipped: 2 }))).toContain("2 rows were skipped. Check them in your file.");
    expect(html(createElement(DoneState, { count: 4, reviewHref: "/imports", onAddMore: vi.fn() }))).not.toContain("skipped");
  });
});
