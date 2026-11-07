import { describe, expect, it } from "vitest";
import { countLabels, dragHasFiles, fileKind, firstFile, heldLine, plainImportError, previewCell, previewColumns, summaryLine } from "./add-records";

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
  });
  it("heldLine explains payments and rows that need a choice", () => {
    const payments = heldLine(counts(0, 0, 2));
    expect(payments).toContain("2 payments");
    expect(payments).toContain("aren't imported");
    expect(heldLine(counts(0, 0, 1))).toContain("1 payment isn't imported");
    expect(heldLine(counts(0, 0, 0, 3))).toContain("need your choice");
    expect(heldLine(counts(0, 0, 0, 1))).toContain("needs your choice");
    expect(heldLine(counts(5, 2))).toBe("");
  });
  it("plainImportError maps limits to plain words", () => {
    expect(plainImportError("The import needs 1–100 data rows.")).toBe("That file has too many rows. Send up to 100 at a time.");
    expect(plainImportError("Use at most 24 columns.")).toBe("That file has too many columns. Keep up to 24.");
    expect(plainImportError("Choose a .csv or .xlsx file up to 512 KiB.")).toBe("That file is too big, or isn't Excel or CSV. Export fewer rows and try again.");
    expect(plainImportError("Something odd happened")).toBe("We couldn't read that file. Check it opens in Excel, then try again.");
    for (const message of ["The import needs 1–100 data rows.", "Use at most 24 columns.", "Choose a .csv or .xlsx file up to 512 KiB.", "x"])
      expect(plainImportError(message)).not.toMatch(BANNED);
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
});
