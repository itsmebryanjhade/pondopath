import { describe, expect, it } from "vitest";
import { connectorReadSchema, normalizeConnectorRows } from "./connector-rows";

const read = (rows: (string | number | boolean | null)[][], headers = ["ID", "Amount", "Original due", "Send"]) =>
  ({ runId: "run-1", headers, rows, rowNumbers: rows.map((_, index) => index + 2) });
const options = { dateColumns: ["Original due"] };

describe("connector sheet values", () => {
  it("converts whole-number serials in date columns to ISO dates", () => {
    const file = normalizeConnectorRows(read([["SRC-1", 15000, 46336, true]]), options);
    expect(file.rows[0][2]).toBe("2026-11-10");
    expect(file.rowNumbers).toEqual([2]);
  });

  it("leaves fractional serials as text so the row fails date validation", () => {
    expect(normalizeConnectorRows(read([["SRC-1", 1, 46336.5, true]]), options).rows[0][2]).toBe("46336.5");
  });

  it("renders numbers as plain decimal text and flags them as non-text", () => {
    const file = normalizeConnectorRows(read([["00042", 12500, "2026-11-10", false], [7, 7500.5, "2026-11-10", false]]), options);
    expect(file.rows.map(row => row.slice(0, 2))).toEqual([["00042", "12500"], ["7", "7500.5"]]);
    expect(file.nonTextCells?.map(row => row.slice(0, 2))).toEqual([[false, true], [true, true]]);
    expect(normalizeConnectorRows(read([["SRC-1", 1e21, "2026-11-10", false]]), options).rows[0][1]).toBe("1e+21");
  });

  it("renders booleans as TRUE/FALSE and null as empty", () => {
    const file = normalizeConnectorRows(read([["SRC-1", null, "", true], ["SRC-2", "", "", false]]), options);
    expect(file.rows.map(row => [row[1], row[3]])).toEqual([["", "TRUE"], ["", "FALSE"]]);
    expect(file.booleanCells.map(row => row[3])).toEqual([true, true]);
  });

  it("accepts an empty Sheet but rejects duplicate or blank headers and more than 500 rows", () => {
    expect(normalizeConnectorRows(read([]), options).rows).toEqual([]);
    expect(() => normalizeConnectorRows(read([], ["ID", "ID"]), options)).toThrow(/unique/);
    expect(() => normalizeConnectorRows(read([], ["ID", " "]), options)).toThrow(/unique/);
    const tooMany = read(Array.from({ length: 501 }, (_, index) => [`SRC-${index}`, 1, "2026-11-10", true]));
    expect(connectorReadSchema.safeParse(tooMany).success).toBe(false);
  });

  it("validates the payload shape, including error reports and matching row numbers", () => {
    expect(connectorReadSchema.safeParse({ runId: "run-1", error: "SHEET_ACCESS_DENIED" }).success).toBe(true);
    expect(connectorReadSchema.safeParse({ runId: "run-1", error: "SOMETHING_ELSE" }).success).toBe(false);
    expect(connectorReadSchema.safeParse({ ...read([["SRC-1", 1, 1, true]]), rowNumbers: [] }).success).toBe(false);
  });

  it("keeps an out-of-range whole serial invalid in its own row", () => {
    const read = { runId: "bad-date", headers: ["Due"], rows: [[1e100], [46346]], rowNumbers: [2, 3] };
    expect(normalizeConnectorRows(read, { dateColumns: ["Due"] }).rows).toEqual([["1e+100"], ["2026-11-20"]]);
  });
});
