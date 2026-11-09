"use client";

import { useMemo, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { addDays } from "@/lib/domain/dates";
import { parseAmountInput, suggestNextInvoiceNumber } from "@/lib/domain/manual-entry";
import { AmountField, CommandForm, DueDateField, Field } from "./command-form";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const decimal = (cents: number) => (cents / 100).toFixed(2);
type Context = { workspace: WorkspaceSnapshot };

export function buildInvoicePayload(data: FormData, invoice?: WorkspaceSnapshot["invoices"][number]) {
  return {
    type: "save_invoice" as const,
    payload: {
      ...(invoice ? { id: invoice.id } : {}),
      number: value(data, "number"),
      customerId: value(data, "customerId"),
      amountCents: parseAmountInput(value(data, "amount")),
      dueDate: value(data, "dueDate"),
      ...(value(data, "reason") ? { reason: value(data, "reason") } : {}),
    },
  };
}

export function buildExpensePayload(data: FormData, expense?: WorkspaceSnapshot["expenses"][number]) {
  return {
    type: "save_expense" as const,
    payload: {
      ...(expense ? { id: expense.id } : {}),
      label: value(data, "label"),
      payee: value(data, "payee"),
      amountCents: parseAmountInput(value(data, "amount")),
      dueDate: value(data, "dueDate"),
      ...(value(data, "reason") ? { reason: value(data, "reason") } : {}),
    },
  };
}

export function buildOpeningCashPayload(data: FormData) {
  return {
    type: "set_opening_cash" as const,
    payload: {
      amountCents: parseAmountInput(value(data, "amount"), { allowZero: true }),
      date: value(data, "date"),
    },
  };
}

export function CustomerForm({
  workspace,
  customer,
  initialName,
}: Context & {
  customer?: WorkspaceSnapshot["customers"][number];
  initialName?: string;
}) {
  return (
    <CommandForm
      revision={workspace.revision}
      label={customer ? "Save customer" : "Add customer"}
      build={(data) => ({
        type: "save_customer",
        payload: {
          ...(customer ? { id: customer.id } : {}),
          name: value(data, "name"),
          contactName: value(data, "contactName"),
          email: value(data, "email"),
          phone: value(data, "phone"),
        },
      })}
    >
      <div className="form-grid">
        <Field
          label="Business / customer name"
          name="name"
          defaultValue={customer?.name ?? initialName ?? ""}
          maxLength={200}
          required
        />
        <Field
          label="Contact person"
          name="contactName"
          defaultValue={customer?.contact_name}
          maxLength={200}
          required
        />
        <Field
          label="Email (optional)"
          name="email"
          type="email"
          defaultValue={customer?.email ?? ""}
          maxLength={254}
        />
        <Field
          label="Phone (optional)"
          name="phone"
          type="tel"
          defaultValue={customer?.phone ?? ""}
          maxLength={50}
        />
      </div>
    </CommandForm>
  );
}

export function InvoiceForm({
  workspace,
  invoice,
  initialProposed,
}: Context & {
  invoice?: WorkspaceSnapshot["invoices"][number];
  initialProposed?: {
    number?: string | null;
    customerId?: string | null;
    party?: string | null;
    amountCents?: number | null;
    dueDate?: string | null;
  };
}) {
  const isNew = !invoice;
  const initialNext = useMemo(
    () => suggestNextInvoiceNumber(workspace.invoices.map((inv) => inv.number)),
    [workspace.invoices],
  );
  const [number, setNumber] = useState(invoice?.number ?? initialProposed?.number ?? initialNext);
  const [customerId, setCustomerId] = useState(invoice?.customer_id ?? initialProposed?.customerId ?? "");
  const numberRef = useRef<HTMLInputElement>(null);

  const defaultDueDate =
    invoice?.due_date ?? initialProposed?.dueDate ?? addDays(workspace.forecastInput.referenceDate, 30);

  const handleAddAnother = () => {
    // Generate the next sequential number based on what was just saved
    setNumber((prev) => suggestNextInvoiceNumber([prev]));
    setTimeout(() => {
      if (numberRef.current) {
        numberRef.current.focus();
        numberRef.current.select();
      }
    }, 0);
  };

  return (
    <CommandForm
      revision={workspace.revision}
      label={invoice ? "Save invoice" : "Add invoice"}
      allowAddAnother={isNew}
      onAddAnother={handleAddAnother}
      build={(data) => buildInvoicePayload(data, invoice)}
    >
      <div className="form-grid">
        <Field
          ref={numberRef}
          label="Invoice number"
          name="number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          maxLength={100}
          help={isNew ? `Suggested: ${number} (editable)` : undefined}
          required
        />
        <label className="form-field">
          <span>Customer</span>
          <select
            className="field"
            name="customerId"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
          >
            <option value="" disabled>
              Select a customer
            </option>
            {workspace.customers.map((customer) => (
              <option value={customer.id} key={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <AmountField
          label="Invoice amount (PHP)"
          name="amount"
          defaultValue={
            invoice
              ? decimal(invoice.amount_cents)
              : initialProposed?.amountCents
                ? decimal(initialProposed.amountCents)
                : ""
          }
          help="Use k or m for shorthand (e.g. 15k, 1.5m). No commas or ₱ sign."
          required
        />
        <DueDateField
          label="Original due date"
          name="dueDate"
          referenceDate={workspace.forecastInput.referenceDate}
          defaultValue={defaultDueDate}
          required
        />
      </div>
      {invoice && (
        <>
          <p className="muted">
            After a payment has been posted, the customer and invoice identity stay locked. Only the
            owner can correct the total or due date, with a reason.
          </p>
          <Field
            label="Correction reason (required for owner corrections after a payment)"
            name="reason"
            maxLength={4000}
          />
        </>
      )}
      {!invoice && (
        <p className="muted">
          A new invoice starts with a labelled due-date assumption. It does not add actual cash or
          confirm a customer promise.
        </p>
      )}
    </CommandForm>
  );
}

export function ExpenseForm({
  workspace,
  expense,
  initialProposed,
}: Context & {
  expense?: WorkspaceSnapshot["expenses"][number];
  initialProposed?: {
    label?: string | null;
    payee?: string | null;
    amountCents?: number | null;
    dueDate?: string | null;
  };
}) {
  const isNew = !expense;
  const labelRef = useRef<HTMLInputElement>(null);

  const handleAddAnother = () => {
    setTimeout(() => {
      labelRef.current?.focus();
    }, 0);
  };

  return (
    <CommandForm
      revision={workspace.revision}
      label={expense ? "Save expense" : "Add expense"}
      allowAddAnother={isNew}
      onAddAnother={handleAddAnother}
      build={(data) => buildExpensePayload(data, expense)}
    >
      <div className="form-grid">
        <Field
          ref={labelRef}
          label="Expense label"
          name="label"
          defaultValue={expense?.label ?? initialProposed?.label ?? ""}
          maxLength={200}
          required
        />
        <Field
          label="Payee"
          name="payee"
          defaultValue={expense?.payee ?? initialProposed?.payee ?? ""}
          maxLength={200}
          required
        />
        <AmountField
          label="Expense amount (PHP)"
          name="amount"
          defaultValue={
            expense
              ? decimal(expense.amount_cents)
              : initialProposed?.amountCents
                ? decimal(initialProposed.amountCents)
                : ""
          }
          help="Use k or m for shorthand (e.g. 15k, 1.5m). No commas or ₱ sign."
          required
        />
        <DueDateField
          label="Original due date"
          name="dueDate"
          referenceDate={workspace.forecastInput.referenceDate}
          defaultValue={expense?.due_date ?? initialProposed?.dueDate ?? workspace.forecastInput.referenceDate}
          required
        />
      </div>
      {expense && (
        <>
          <p className="muted">
            Posted expenses keep their payee and identity. Only the owner can correct the total or
            due date after a payment.
          </p>
          <Field label="Correction reason" name="reason" maxLength={4000} />
        </>
      )}
    </CommandForm>
  );
}

/** Opening cash: how much the business had at the start of one day. Two fields, saved once; it locks after the first payment. */
export function OpeningCashForm({
  workspace,
  onSaved,
  onCancel,
}: Context & { onSaved?: () => void; onCancel?: () => void }) {
  return (
    <CommandForm
      revision={workspace.revision}
      label="Save opening cash"
      onSaved={onSaved}
      secondary={
        onCancel && (
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        )
      }
      build={buildOpeningCashPayload}
    >
      <div className="form-grid">
        <AmountField
          label="Cash you had (PHP)"
          name="amount"
          defaultValue={decimal(workspace.business.opening_cash_cents)}
          help="Bank and cash on hand together. Use k or m (e.g. 50k). Use 0 if starting fresh."
          required
        />
        <Field
          label="At the start of"
          name="date"
          type="date"
          defaultValue={workspace.business.opening_date}
          max={workspace.forecastInput.referenceDate}
          help="Payments from this day on are counted after it."
          required
        />
      </div>
    </CommandForm>
  );
}
