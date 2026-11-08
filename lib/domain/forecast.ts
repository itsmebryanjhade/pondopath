import { addDays, assertLocalDate } from "./dates";
import { checkedSum, MAX_RECORD_CENTS } from "./money";
import type { ForecastDay, ForecastInput, ForecastResult, LocalDate, UUID, Cents } from "./types";

export const FORECAST_DAYS = 30;

function assertRecordAmount(amount: Cents): void {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_RECORD_CENTS) {
    throw new RangeError("Record balances must be nonnegative centavos within the record limit.");
  }
}

export function calculateForecast(input: ForecastInput): ForecastResult {
  assertLocalDate(input.referenceDate);
  checkedSum([input.availableCents]);
  const days: ForecastDay[] = Array.from({ length: FORECAST_DAYS }, (_, offset) => ({
    date: addDays(input.referenceDate, offset),
    expectedInCents: 0,
    plannedOutCents: 0,
    closingCents: 0,
    invoiceIds: [],
    expenseIds: [],
  }));
  const daysByDate = new Map(days.map((day) => [day.date, day]));
  const incompleteInvoiceIds: UUID[] = [];
  const staleExpectationIds: UUID[] = [];
  const overdueExpenseIds: UUID[] = [];
  const invoiceIds = new Set<UUID>();
  const expenseIds = new Set<UUID>();

  for (const invoice of input.invoices) {
    if (invoiceIds.has(invoice.id)) throw new RangeError("Duplicate invoice in the cash plan.");
    invoiceIds.add(invoice.id);
    assertRecordAmount(invoice.outstandingCents);
    const expectation = invoice.expectation;
    if (expectation) {
      assertLocalDate(expectation.date);
      assertRecordAmount(expectation.remainingCents);
      if (expectation.remainingCents > invoice.outstandingCents) {
        throw new RangeError("Expected receipts cannot exceed the outstanding invoice balance.");
      }
    }
    if (invoice.outstandingCents === 0) continue;
    const stale = !!expectation && expectation.date < input.referenceDate;
    if (!expectation || expectation.needsReview || stale || expectation.remainingCents < invoice.outstandingCents) {
      incompleteInvoiceIds.push(invoice.id);
    }
    if (stale && expectation.remainingCents > 0) staleExpectationIds.push(expectation.id);
    if (!expectation || expectation.needsReview || stale || expectation.remainingCents === 0) continue;
    const day = daysByDate.get(expectation.date);
    if (day) {
      day.expectedInCents = checkedSum([day.expectedInCents, expectation.remainingCents]);
      day.invoiceIds.push(invoice.id);
    }
  }

  for (const expense of input.expenses) {
    if (expenseIds.has(expense.id)) throw new RangeError("Duplicate expense in the cash plan.");
    expenseIds.add(expense.id);
    assertLocalDate(expense.dueDate);
    assertRecordAmount(expense.unpaidCents);
    if (expense.unpaidCents === 0) continue;
    const overdue = expense.dueDate < input.referenceDate;
    if (overdue) overdueExpenseIds.push(expense.id);
    const day = daysByDate.get(overdue ? input.referenceDate : expense.dueDate);
    if (day) {
      day.plannedOutCents = checkedSum([day.plannedOutCents, expense.unpaidCents]);
      day.expenseIds.push(expense.id);
    }
  }

  let balance = input.availableCents;
  let firstShortage: ForecastResult["firstShortage"] = null;
  let maxShortfallCents = 0;
  for (const day of days) {
    balance = checkedSum([balance, day.expectedInCents, -day.plannedOutCents]);
    day.closingCents = balance;
    if (balance < 0) {
      if (!firstShortage) firstShortage = { date: day.date, shortfallCents: -balance };
      maxShortfallCents = Math.max(maxShortfallCents, -balance);
    }
  }
  return { days, firstShortage, maxShortfallCents, incompleteInvoiceIds, staleExpectationIds, overdueExpenseIds };
}

export function compareScenario(input: ForecastInput, override: { invoiceId: UUID; date: LocalDate; amountCents: Cents }): { baseline: ForecastResult; scenario: ForecastResult } {
  const baseline = calculateForecast(input);
  assertLocalDate(override.date);
  assertRecordAmount(override.amountCents);
  const invoice = input.invoices.find((record) => record.id === override.invoiceId);
  if (!invoice || override.amountCents > invoice.outstandingCents) {
    throw new RangeError("Select an existing invoice and an amount within its outstanding balance.");
  }
  const invoices = input.invoices.map((record) => record.id === invoice.id ? {
    ...record,
    expectation: {
      id: record.expectation?.id ?? record.id,
      date: override.date,
      remainingCents: override.amountCents,
      kind: "assumption" as const,
      needsReview: false,
    },
  } : record);
  return { baseline, scenario: calculateForecast({ ...input, invoices }) };
}
