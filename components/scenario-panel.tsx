"use client";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { compareScenario as previewExpectation } from "@/lib/domain/forecast";
import { parseMoney } from "@/lib/domain/money";
import { Field } from "./command-form";
import { CashImpact } from "./cash-impact";

export function ScenarioPanel({
  workspace,
  invoiceId,
}: {
  workspace: WorkspaceSnapshot;
  invoiceId?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<ReturnType<typeof previewExpectation> | null>(null);
  const [error, setError] = useState("");
  const invoices = workspace.invoices.filter(
    (row) => row.outstanding_cents > 0 && (!invoiceId || row.id === invoiceId),
  );
  useEffect(() => {
    const currentForm = form.current;
    return () => {
      currentForm?.reset();
      setPreview(null);
      setError("");
    };
  }, []);
  if (!invoices.length) return null;
  return (
    <details className="panel disclosure scenario-panel">
      <summary>What if a customer pays later or only part of an invoice?</summary>
      <form
        ref={form}
        className="record-form"
        onInput={() => {
          setPreview(null);
          setError("");
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            setPreview(
              previewExpectation(workspace.forecastInput, {
                invoiceId: String(data.get("invoiceId")),
                date: String(data.get("date")),
                amountCents: parseMoney(String(data.get("amount")), { allowZero: true }),
              }),
            );
            setError("");
          } catch (failure) {
            setPreview(null);
            setError(
              failure instanceof RangeError ? failure.message : "Review the scenario inputs.",
            );
          }
        }}
      >
        <div className="form-grid">
          <label className="form-field">
            <span>Invoice to preview</span>
            <select
              className="field"
              name="invoiceId"
              defaultValue={invoiceId ?? invoices[0].id}
              required
            >
              {invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number}
                </option>
              ))}
            </select>
          </label>
          <Field label="Scenario receipt date" name="date" type="date" required />
          <Field
            label="Scenario receipt amount (PHP)"
            name="amount"
            inputMode="decimal"
            help="Enter zero to test no receipt. The amount cannot exceed the unpaid balance."
            required
          />
        </div>
        <div className="scenario-actions">
          <button type="submit" className="button secondary">
            Preview cash impact
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              form.current?.reset();
              setPreview(null);
              setError("");
            }}
          >
            Discard scenario
          </button>
        </div>
      </form>
      {error && (
        <p className="form-feedback error-feedback" role="alert">
          {error}
        </p>
      )}
      {preview && <CashImpact {...preview} />}
      <p className="muted">
        One temporary invoice scenario. Navigating away or discarding clears it; a real update uses
        the reviewed receipt plan.
      </p>
    </details>
  );
}
