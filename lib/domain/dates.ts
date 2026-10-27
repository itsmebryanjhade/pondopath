import type { LocalDate } from "./types";

const manilaFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function assertLocalDate(value: string): LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    throw new RangeError("Enter a calendar date in YYYY-MM-DD format.");
  }
  const instant = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Enter a valid calendar date.");
  }
  return value;
}

export function manilaDate(now: Date): LocalDate {
  const parts = manilaFormatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")!.value.padStart(4, "0");
  const month = parts.find((part) => part.type === "month")!.value;
  const day = parts.find((part) => part.type === "day")!.value;
  return assertLocalDate(year + "-" + month + "-" + day);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  assertLocalDate(date);
  if (!Number.isSafeInteger(days)) {
    throw new RangeError("Day offsets must be safe integers.");
  }
  const instant = new Date(date + "T00:00:00.000Z");
  instant.setUTCDate(instant.getUTCDate() + days);
  return assertLocalDate(instant.toISOString().slice(0, 10));
}
