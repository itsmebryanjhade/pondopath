export type Cents = number;
export type LocalDate = string;
export type UUID = string;

export type ForecastInvoice = {
  id: UUID;
  outstandingCents: Cents;
  expectation: {
    id: UUID;
    date: LocalDate;
    remainingCents: Cents;
    kind: "assumption" | "commitment";
    needsReview: boolean;
  } | null;
};

export type ForecastExpense = {
  id: UUID;
  dueDate: LocalDate;
  unpaidCents: Cents;
};

export type ForecastInput = {
  referenceDate: LocalDate;
  availableCents: Cents;
  invoices: ForecastInvoice[];
  expenses: ForecastExpense[];
};

export type ForecastDay = {
  date: LocalDate;
  expectedInCents: Cents;
  plannedOutCents: Cents;
  closingCents: Cents;
  invoiceIds: UUID[];
  expenseIds: UUID[];
};

export type ForecastResult = {
  days: ForecastDay[];
  firstShortage: { date: LocalDate; shortfallCents: Cents } | null;
  maxShortfallCents: Cents;
  incompleteInvoiceIds: UUID[];
  staleExpectationIds: UUID[];
  overdueExpenseIds: UUID[];
};
