import { createHash } from "node:crypto";

export type ReminderBasisInput = {
  invoiceId: string;
  invoiceVersion: number;
  outstandingCents: number;
  contactVersion: number;
  expectationId: string | null;
  expectationVersion: number | null;
  referenceDate: string;
};

export function reminderBasis(input: ReminderBasisInput): string {
  return createHash("sha256")
    .update([
      input.invoiceId,
      input.invoiceVersion,
      input.outstandingCents,
      input.contactVersion,
      input.expectationId ?? "",
      input.expectationVersion ?? "",
      input.referenceDate,
    ].join("\u001f"))
    .digest("hex");
}

export function reminderTemplate(input: {
  contactName: string;
  invoiceNumber: string;
  outstandingCents: number;
  dueDate: string;
  referenceDate: string;
}): string {
  const due = new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${input.dueDate}T00:00:00Z`));
  const timing = input.dueDate < input.referenceDate ? `overdue since ${due}` : `due on ${due}`;
  const amount = (input.outstandingCents / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Good day ${input.contactName},\n\nThis is a friendly reminder that PHP ${amount} remains outstanding for invoice ${input.invoiceNumber}, ${timing}. Please confirm your expected payment date, or let us know if you need any supporting information.\n\nThank you.`;
}
