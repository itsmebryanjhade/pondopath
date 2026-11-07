"use client";

import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { parseMoney } from "@/lib/domain/money";
import { CommandForm, Field } from "./command-form";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const decimal = (cents: number) => (cents / 100).toFixed(2);
type Context = { workspace: WorkspaceSnapshot };

export function CustomerForm({
  workspace,
  customer,
}: Context & { customer?: WorkspaceSnapshot["customers"][number] }) {
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
          defaultValue={customer?.name}
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
}: Context & { invoice?: WorkspaceSnapshot["invoices"][number] }) {
  return (
    <CommandForm
      revision={workspace.revision}
      label={invoice ? "Save invoice" : "Add invoice"}
      build={(data) => ({
        type: "save_invoice",
        payload: {
          ...(invoice ? { id: invoice.id } : {}),
          number: value(data, "number"),
          customerId: value(data, "customerId"),
          amountCents: parseMoney(value(data, "amount")),
          dueDate: value(data, "dueDate"),
          ...(value(data, "reason") ? { reason: value(data, "reason") } : {}),
        },
      })}
    >
      <div className="form-grid">
        <Field
          label="Invoice number"
          name="number"
          defaultValue={invoice?.number}
          maxLength={100}
          required
        />
        <label className="form-field">
          <span>Customer</span>
          <select
            className="field"
            name="customerId"
            defaultValue={invoice?.customer_id ?? ""}
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
        <Field
          label="Invoice amount (PHP)"
          name="amount"
          inputMode="decimal"
          defaultValue={invoice ? decimal(invoice.amount_cents) : ""}
          help="Use the unpaid amount at setup; no commas or currency symbols."
          required
        />
        <Field
          label="Original due date"
          name="dueDate"
          type="date"
          defaultValue={invoice?.due_date ?? workspace.forecastInput.referenceDate}
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
}: Context & { expense?: WorkspaceSnapshot["expenses"][number] }) {
  return (
    <CommandForm
      revision={workspace.revision}
      label={expense ? "Save expense" : "Add expense"}
      build={(data) => ({
        type: "save_expense",
        payload: {
          ...(expense ? { id: expense.id } : {}),
          label: value(data, "label"),
          payee: value(data, "payee"),
          amountCents: parseMoney(value(data, "amount")),
          dueDate: value(data, "dueDate"),
          ...(value(data, "reason") ? { reason: value(data, "reason") } : {}),
        },
      })}
    >
      <div className="form-grid">
        <Field
          label="Expense label"
          name="label"
          defaultValue={expense?.label}
          maxLength={200}
          required
        />
        <Field label="Payee" name="payee" defaultValue={expense?.payee} maxLength={200} required />
        <Field
          label="Expense amount (PHP)"
          name="amount"
          inputMode="decimal"
          defaultValue={expense ? decimal(expense.amount_cents) : ""}
          required
        />
        <Field
          label="Original due date"
          name="dueDate"
          type="date"
          defaultValue={expense?.due_date ?? workspace.forecastInput.referenceDate}
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
export function OpeningCashForm({ workspace, onSaved, onCancel }: Context & { onSaved?: () => void; onCancel?: () => void }) {
  return (
    <CommandForm
      revision={workspace.revision}
      label="Save opening cash"
      onSaved={onSaved}
      secondary={onCancel && <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>}
      build={(data) => ({
        type: "set_opening_cash",
        payload: {
          amountCents: parseMoney(value(data, "amount"), { allowZero: true }),
          date: value(data, "date"),
        },
      })}
    >
      <div className="form-grid">
        <Field
          label="Cash you had (PHP)"
          name="amount"
          inputMode="decimal"
          defaultValue={decimal(workspace.business.opening_cash_cents)}
          help="Bank and cash on hand together. Use 0 if you're starting fresh."
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
