import { describe, expect, it } from "vitest";
import { addDays, assertLocalDate, manilaDate } from "./dates";

describe("assertLocalDate", () => {
  it.each(["2026-10-26", "2028-02-29", "0001-01-01", "0099-12-31"])(
    "accepts the valid calendar date %s",
    (date) => expect(assertLocalDate(date)).toBe(date),
  );

  it.each([
    "2026-02-30", "2026-02-29", "2026-13-01", "2026-00-01", "2026-01-00",
    "2026-2-01", "2026-01-01T00:00:00Z", "", "0000-01-01",
  ])("rejects invalid calendar input %s", (date) => {
    expect(() => assertLocalDate(date)).toThrow(RangeError);
  });
});

describe("manilaDate", () => {
  it("changes the date at Manila midnight rather than UTC midnight", () => {
    expect(manilaDate(new Date("2026-10-26T15:59:59Z"))).toBe("2026-10-26");
    expect(manilaDate(new Date("2026-10-26T16:00:00Z"))).toBe("2026-10-27");
    expect(manilaDate(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });

  it("rejects an invalid instant", () => {
    expect(() => manilaDate(new Date(NaN))).toThrow(RangeError);
  });
});

describe("addDays", () => {
  it.each([
    ["2026-10-26", 29, "2026-11-24"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["0099-12-31", 1, "0100-01-01"],
    ["2026-10-26", 0, "2026-10-26"],
  ])("adds calendar days to %s", (date, offset, expected) => {
    expect(addDays(String(date), Number(offset))).toBe(expected);
  });

  it("rejects fractional offsets and dates outside the supported calendar", () => {
    expect(() => addDays("2026-10-26", 0.5)).toThrow(RangeError);
    expect(() => addDays("9999-12-31", 1)).toThrow(RangeError);
    expect(() => addDays("0001-01-01", -1)).toThrow(RangeError);
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});
