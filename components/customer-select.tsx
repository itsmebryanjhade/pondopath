"use client";

import { useContext, useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { executeWorkspaceAction } from "@/app/(workspace)/actions";
import { workspaceCommandSchema, type WorkspaceCommand } from "@/lib/domain/commands";
import { useToast } from "./toast-host";
import { OwnChangeContext } from "./command-form";

const NEW = "__new__";

type Customer = { id: string; name: string };

/**
 * The invoice form's Customer dropdown, with "+ Add a new customer…" as its last option.
 * Choosing it opens a small panel right under the dropdown; saving adds the customer through the usual
 * save_customer command and selects it, without leaving the invoice form or losing what was typed.
 * The panel is plain inputs (no name attribute, no nested form), so the invoice form never submits them.
 */
export function CustomerSelect({ customers, revision, defaultValue = "" }: { customers: Customer[]; revision: number; defaultValue?: string }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [adding, setAdding] = useState(customers.length === 0);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sent = useRef<WorkspaceCommand | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const ownChange = useContext(OwnChangeContext);

  // Select the new customer as soon as the refreshed list includes it (adjusting state while rendering).
  if (waitingFor && customers.some((customer) => customer.id === waitingFor)) {
    setValue(waitingFor);
    setWaitingFor(null);
    setAdding(false);
  }

  useEffect(() => { if (adding && customers.length) nameInput.current?.focus(); }, [adding, customers.length]);

  function save() {
    if (pending) return;
    if (!name.trim() || !contact.trim()) { setError("Enter the customer’s name and a contact person."); return; }
    let command = sent.current;
    if (!command) {
      const parsed = workspaceCommandSchema.safeParse({ type: "save_customer", requestId: crypto.randomUUID(), expectedRevision: revision, payload: { name, contactName: contact } });
      if (!parsed.success) { setError("Check the name and contact person."); return; }
      command = parsed.data;
      sent.current = command;
    }
    const original = command;
    setError("");
    start(async () => {
      let result: Awaited<ReturnType<typeof executeWorkspaceAction>>;
      try { result = await executeWorkspaceAction(original); }
      catch { result = { ok: false, code: "SERVICE_UNAVAILABLE", message: "The save couldn’t be confirmed. Press Add customer again to retry." }; }
      if (!result.ok) {
        setError(result.message);
        if (result.code !== "SERVICE_UNAVAILABLE") sent.current = null;
        if (result.code === "STALE_VERSION") router.refresh();
        return;
      }
      sent.current = null;
      ownChange({ from: original.expectedRevision, to: result.data.revision });
      setName(""); setContact("");
      setWaitingFor(result.data.recordId);
      // The panel closes once the new customer is listed; keep keyboard focus on the dropdown it belongs to.
      select.current?.focus();
      toast.show(`Customer added: ${original.type === "save_customer" ? original.payload.name : ""}`);
    });
  }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter adds the customer instead of submitting the invoice form around it.
    if (event.key === "Enter") { event.preventDefault(); save(); }
    if (event.key === "Escape" && customers.length) { event.preventDefault(); setAdding(false); select.current?.focus(); }
  };

  return (
    <div className="form-field customer-select">
      <label htmlFor={`${id}-select`}>Customer</label>
      <select ref={select} id={`${id}-select`} className="field" name="customerId" required value={value}
        onChange={(event) => {
          if (event.target.value === NEW) { setAdding(true); return; }
          setValue(event.target.value);
          setAdding(false);
        }}>
        <option value="" disabled>{customers.length ? "Select a customer" : "No customers yet"}</option>
        {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
        <option disabled>──────────</option>
        <option value={NEW}>+ Add a new customer…</option>
      </select>
      {adding && (
        <div className="customer-new" role="group" aria-labelledby={`${id}-new`}>
          <p id={`${id}-new`} className="customer-new-title">{customers.length ? "New customer" : "Add your first customer"}</p>
          <div className="customer-new-fields">
            <label className="form-field"><span>Customer name</span><input ref={nameInput} className="field" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} onKeyDown={onKey} disabled={pending} autoComplete="organization" /></label>
            <label className="form-field"><span>Contact person</span><input className="field" value={contact} maxLength={200} onChange={(event) => setContact(event.target.value)} onKeyDown={onKey} disabled={pending} autoComplete="name" /></label>
          </div>
          {error && <p className="form-feedback error-feedback" role="alert">{error}</p>}
          <div className="customer-new-actions">
            <button type="button" className="button" onClick={save} disabled={pending}>{pending ? "Adding…" : "Add customer"}</button>
            {customers.length > 0 && <button type="button" className="row-action is-quiet" onClick={() => { setAdding(false); setError(""); select.current?.focus(); }} disabled={pending}>Cancel</button>}
          </div>
          <p className="muted customer-new-hint">Add an email or phone later from the invoice page.</p>
        </div>
      )}
    </div>
  );
}
