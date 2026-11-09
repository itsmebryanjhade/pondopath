import { describe, expect, it } from "vitest";
import { countLabels, dragHasFiles, fileKind, firstFile, heldLine, plainImportError, previewCell, previewColumns, sheetToRead, summarizeOutcome, summarizeWorkbookRows, summaryLine } from "./add-records";

const counts = (invoice = 0, expense = 0, payment = 0, choose = 0) => ({ invoice, expense, payment, choose });
const BANNED = /KiB|UTF|row ID|YYYY|source/i;

describe("Add records helpers", () => {
  it("fileKind accepts .csv and .xlsx in any case and rejects others", () => {
    expect(fileKind("A.CSV")).toBe("csv");
    expect(fileKind("b.xlsx")).toBe("xlsx");
    for (const name of ["c.xls", "d.pdf", "e", "csv", ".xlsx.pdf"]) expect(fileKind(name)).toBeNull();
  });
  it("dragHasFiles is true only when the drag carries files", () => {
    expect(dragHasFiles(["Files"])).toBe(true);
    expect(dragHasFiles(["text/plain", "Files"])).toBe(true);
    expect(dragHasFiles(["text/plain"])).toBe(false);
    expect(dragHasFiles([])).toBe(false);
  });
  it("firstFile returns the first file and null for none", () => {
    const a = new File(["x"], "a.csv"), b = new File(["y"], "b.csv");
    expect(firstFile([a, b])).toBe(a);
    expect(firstFile([])).toBeNull();
    expect(firstFile(null)).toBeNull();
    expect(firstFile(undefined)).toBeNull();
  });
  it("countLabels tallies each kind of row", () => {
    expect(countLabels([{ label: "invoice" }, { label: "invoice" }, { label: "expense" }, { label: "payment" }, { label: "choose" }])).toEqual(counts(2, 1, 1, 1));
  });
  it("summaryLine uses plain counts", () => {
    expect(summaryLine(counts(12, 3))).toBe("We found 12 invoices and 3 expenses.");
    expect(summaryLine(counts(1))).toBe("We found 1 invoice.");
    expect(summaryLine(counts(0, 1))).toBe("We found 1 expense.");
    expect(summaryLine(counts())).toBe("We couldn't find any invoices or expenses in this file.");
    expect(summaryLine(counts(0, 0, 0, 5))).toBe("We found 5 rows. Tell us below which are invoices and which are expenses.");
    expect(summaryLine(counts(0, 0, 0, 1))).toBe("We found 1 row. Tell us below if it's an invoice or an expense.");
    expect(summaryLine(counts(2, 0, 0, 3))).toBe("We found 2 invoices. 3 more rows need your choice.");
    expect(summaryLine(counts(0, 0, 2, 0))).toBe("We only found payments in this file. Record them in Collections.");
  });
  it("heldLine explains payments and rows that need a choice", () => {
    const payments = heldLine(counts(0, 0, 2));
    expect(payments).toContain("2 payments");
    expect(payments).toContain("aren't imported");
    expect(heldLine(counts(0, 0, 1))).toContain("1 payment isn't imported");
    expect(heldLine(counts(0, 0, 0, 3))).toBe("");
    expect(heldLine(counts(5, 2))).toBe("");
  });
  it("plainImportError turns the real server messages into what to do next", () => {
    const cases: [string, string][] = [
      ["Include a header and 1–100 data rows per import.", "Your file needs a row of column names and 1 to 100 rows of records. Check it isn't empty, and send up to 100 rows at a time."],
      ["Use up to 24 unique, nonempty column headers (maximum 200 characters each).", "Give every column a short, different name in the first row, and keep to 24 columns."],
      ["The CSV has invalid quoting or a row larger than 16 KiB.", "We couldn't read this CSV. Save it again from Excel as CSV, then try again."],
      ["Each data row must fit within 16 KiB.", "One row is too long. Shorten long notes in your file, then try again."],
      ["Replace spreadsheet formulas with literal values before importing.", "Your sheet has formulas. Copy the cells and paste them as values, then try again."],
      ["Replace Excel error values (such as #N/A or #REF!) and TRUE/FALSE cells with plain values before importing.", "Some cells show errors like #N/A, or TRUE/FALSE. Replace them with plain values, then try again."],
      ["Put the column headers in worksheet row 1.", "Put the column names in the first row of the sheet, then try again."],
      ["Choose a .csv or .xlsx file up to 512 KiB.", "That file is empty, too big, or not Excel or CSV. Choose an Excel or CSV file with fewer rows."],
      ["Select a worksheet.", "Choose which sheet to use."],
      ["Something odd happened", "We couldn't read that file. Check it opens in Excel, then try again."],
    ];
    for (const [server, plain] of cases) {
      expect(plainImportError(server)).toBe(plain);
      expect(plainImportError(server)).not.toMatch(BANNED);
    }
  });
  it("sheetToRead picks the first sheet when an Excel file came back without one", () => {
    expect(sheetToRead("xlsx", null, ["Sales", "Bills"])).toBe("Sales");
    expect(sheetToRead("xlsx", "Bills", ["Sales", "Bills"])).toBeNull();
    expect(sheetToRead("xlsx", null, [])).toBeNull();
    expect(sheetToRead("csv", null, [])).toBeNull();
  });
  it("summarizeOutcome counts new, already-sent and skipped rows honestly", () => {
    expect(summarizeOutcome(["new", "new", "invalid", "duplicate"], [
      { status: "pending", replayed: false }, { status: "needs_match", replayed: false }, { status: "pending", replayed: true }, { status: "error" },
    ])).toEqual({ fresh: 2, already: 1, skipped: 3 });
    expect(summarizeOutcome([], [{ status: "error" }, { status: "error" }])).toEqual({ fresh: 0, already: 0, skipped: 2 });
    expect(summarizeOutcome(["unchanged", "balance_review", "settled"], [])).toEqual({ fresh: 0, already: 1, skipped: 2 });
  });
  it("previewColumns builds Name, Who, Amount and Due from whichever columns the reader found", () => {
    const headers = ["ID", "Type", "Customer", "Supplier", "Invoice no", "Amount", "Due", "Description"];
    expect(previewColumns(headers, { externalId: "ID", number: "Invoice no", label: "Description", customer: "Customer", payee: "Supplier", amount: "Amount", dueDate: "Due" }))
      .toEqual([{ title: "Name", columns: [4, 7] }, { title: "Who", columns: [2, 3] }, { title: "Amount", columns: [5] }, { title: "Due", columns: [6] }]);
    expect(previewColumns(headers, { externalId: "ID", amount: "Amount" })).toEqual([{ title: "Name", columns: [0] }, { title: "Amount", columns: [5] }]);
    expect(previewColumns(["A", "B", "C", "D", "E"], {})).toEqual([{ title: "A", columns: [0] }, { title: "B", columns: [1] }, { title: "C", columns: [2] }, { title: "D", columns: [3] }]);
  });
  it("previewCell uses the first filled column of a group", () => {
    expect(previewCell(["INV-1", "", "Rent"], [1, 2])).toBe("Rent");
    expect(previewCell(["INV-1", "", "Rent"], [0, 2])).toBe("INV-1");
    expect(previewCell(["", null, ""], [0, 1])).toBe("");
  });
  it("reports per-sheet ready totals, open-balance exclusions, and row-level exceptions", () => {
    const summary = summarizeWorkbookRows([
      { sheet: "Invoices", row: 2, externalId: "INV-1", status: "new", message: "Review before applying.", candidate: { type: "save_invoice", payload: { number: "INV-1", customerId: "00000000-0000-4000-8000-000000000001", amountCents: 5000000, dueDate: "2026-11-15" } } },
      { sheet: "Invoices", row: 3, externalId: "INV-2", status: "balance_review", message: "Partly paid; review the open balance.", openCents: 3000000 },
      { sheet: "Invoices", row: 4, externalId: "INV-3", status: "settled", message: "Settled row excluded.", openCents: 0 },
      { sheet: "Invoices", row: 5, externalId: "INV-4", status: "invalid", message: "Use an unambiguous YYYY-MM-DD due date." },
      { sheet: "Bills", row: 2, externalId: "BILL-1", status: "new", message: "Review before applying.", candidate: { type: "save_expense", payload: { label: "Stock", payee: "Northwind", amountCents: 85000, dueDate: "2026-11-18" } } },
    ]);
    expect(summary).toEqual({
      readyCount: 2, readyCents: 5085000, exceptionCount: 3, excludedOpenCount: 1, excludedOpenCents: 3000000,
      groups: [
        { sheet: "Invoices", readyCount: 1, readyCents: 5000000, exceptionCount: 3, excludedOpenCount: 1, excludedOpenCents: 3000000,
          exceptions: [{ row: 3, externalId: "INV-2", status: "balance_review", message: "Partly paid; review the open balance." }, { row: 4, externalId: "INV-3", status: "settled", message: "Settled row excluded." }, { row: 5, externalId: "INV-4", status: "invalid", message: "Use an unambiguous YYYY-MM-DD due date." }] },
        { sheet: "Bills", readyCount: 1, readyCents: 85000, exceptionCount: 0, excludedOpenCount: 0, excludedOpenCents: 0, exceptions: [] },
      ],
    });
  });
});
