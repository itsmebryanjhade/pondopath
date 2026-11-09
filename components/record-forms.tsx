"use client";

import { useMemo, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { addDays } from "@/lib/domain/dates";
import { parseMoney } from "@/lib/domain/money";
import { parseAmountInput, suggestNextInvoiceNumber } from "@/lib/domain/manual-entry";
import { AmountField, CommandForm, DueDateField, Field, TextAreaField } from "./command-form";
import { CustomerSelect as PickCustomer } from "./customer-select";

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
          defaultValue={customer?.contact_name ?? ""}
          maxLength={200}
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          defaultValue={customer?.email ?? ""}
          maxLength={200}
        />
        <Field
          label="Phone number"
          name="phone"
          defaultValue={customer?.phone ?? ""}
          maxLength={50}
        />
      </div>
      <p className="muted">
        Customer details are used for invoice statements and reminders. They are kept within your
        workspace.
      </p>
    </CommandForm>
  );
}

function CustomerSelect({ workspace, defaultValue = "" }: Context & { defaultValue?: string }) {
  return <PickCustomer customers={workspace.customers} revision={workspace.revision} defaultValue={defaultValue} />;
}

function NewInvoiceForm({
  workspace,
  initialProposed,
}: Context & {
  initialProposed?: {
    number?: string | null;
    customerId?: string | null;
    party?: string | null;
    amountCents?: number | null;
    dueDate?: string | null;
  };
}) {
  const initialNext = useMemo(
    () => suggestNextInvoiceNumber(workspace.invoices.map((inv) => inv.number)),
    [workspace.invoices],
  );
  const [number, setNumber] = useState(initialProposed?.number ?? initialNext);
  const customerId = initialProposed?.customerId ?? "";
  const numberRef = useRef<HTMLInputElement>(null);

  const defaultDueDate = initialProposed
    ? initialProposed.dueDate ?? ""
    : addDays(workspace.forecastInput.referenceDate, 30);

  const handleAddAnother = () => {
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
      label="Add invoice"
      allowAddAnother={true}
      onAddAnother={handleAddAnother}
      build={(data) => buildInvoicePayload(data)}
    >
      <div className="form-grid">
        <Field
          ref={numberRef}
          label="Invoice number"
          name="number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          maxLength={100}
          help={`Suggested: ${number} (editable)`}
          required
        />
        <CustomerSelect workspace={workspace} defaultValue={customerId} />
        <AmountField
          label="Invoice amount (PHP)"
          name="amount"
          defaultValue={initialProposed?.amountCents ? decimal(initialProposed.amountCents) : ""}
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
      <p className="muted">
        A new invoice starts with a labelled due-date assumption. It does not add actual cash or
        confirm a customer promise.
      </p>
    </CommandForm>
  );
}

export function InvoiceForm({
  workspace,
  invoice,
  locked,
  initialProposed,
}: Context & {
  invoice?: WorkspaceSnapshot["invoices"][number];
  locked?: boolean;
  initialProposed?: {
    number?: string | null;
    customerId?: string | null;
    party?: string | null;
    amountCents?: number | null;
    dueDate?: string | null;
  };
}) {
  if (invoice) return <EditInvoiceForm workspace={workspace} invoice={invoice} locked={locked} />;
  return <NewInvoiceForm workspace={workspace} initialProposed={initialProposed} />;
}

/**
 * Edit an invoice. Before any payment, every field can change. After a payment is recorded,
 * only an owner can change the total or due date, and a reason is required.
 */
function EditInvoiceForm({ workspace, invoice, locked }: Context & { invoice: WorkspaceSnapshot["invoices"][number]; locked?: boolean }) {
  const isOwner = workspace.actor.role === "owner";
  const customer = workspace.customers.find((row) => row.id === invoice.customer_id);
  const isLocked = locked === true;
  if (isLocked && !isOwner) {
    return (
      <p className="invoice-edit-note">
        A payment is recorded on this invoice, so only the owner can change its total or due date.
      </p>
    );
  }
  return (
    <CommandForm
      revision={workspace.revision}
      label={locked !== undefined ? "Save changes" : "Save invoice"}
      build={(data) => ({
        type: "save_invoice",
        payload: {
          id: invoice.id,
          number: value(data, "number"),
          customerId: value(data, "customerId"),
          amountCents: parseMoney(value(data, "amount")),
          dueDate: value(data, "dueDate"),
          ...(value(data, "reason") ? { reason: value(data, "reason") } : {}),
        },
      })}
    >
      {isLocked ? (
        <>
          <input type="hidden" name="number" value={invoice.number} />
          <input type="hidden" name="customerId" value={invoice.customer_id} />
          <p className="invoice-edit-locked">
            <strong>{invoice.number}</strong> · {customer?.name ?? "Customer"}
            <span>Locked because a payment is recorded</span>
          </p>
        </>
      ) : (
        <div className="form-grid">
          <Field label="Invoice number" name="number" defaultValue={invoice.number} maxLength={100} required />
          <CustomerSelect workspace={workspace} defaultValue={invoice.customer_id} />
        </div>
      )}
      <div className="form-grid">
        <Field
          label="Invoice total (PHP)"
          name="amount"
          inputMode="decimal"
          defaultValue={decimal(invoice.amount_cents)}
          help="The invoice's total before any payments."
          required
        />
        <Field label="Due date" name="dueDate" type="date" defaultValue={invoice.due_date} required />
      </div>
      {isLocked && (
        <TextAreaField label="Reason for this change" name="reason" maxLength={4000} required help="Saved in the invoice history." />
      )}
      <p className="muted">Changing the total or due date asks you to check the expected payment again.</p>
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
          defaultValue={expense?.due_date ?? (initialProposed ? initialProposed.dueDate ?? "" : workspace.forecastInput.referenceDate)}
          required
        />
      </div>
      {expense && (
        <TextAreaField
          label="Reason for this change (optional)"
          name="reason"
          maxLength={4000}
          help="Saved in the expense history."
        />
      )}
      <p className="muted">
        Planned expenses and bills are deducted on their due date. They can be marked paid as bank
        records are reconciled.
      </p>
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
          label="Date you started counting"
          name="date"
          type="date"
          defaultValue={workspace.business.opening_date}
          help="Before your first recorded payment."
          required
        />
      </div>
      <p className="muted">
        Opening cash sets the starting balance for your forecast. Once a payment is recorded,
        changing it requires removing or reassigning the payment first.
      </p>
    </CommandForm>
  );
}
