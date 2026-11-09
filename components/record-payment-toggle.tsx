"use client";

import { useId, useState, type ReactNode } from "react";
import { AppIcon } from "./app-icon";

/**
 * The invoice page's "Record payment" button. It stays in place; the form slides open below the balance
 * (grid-rows accordion) and stays mounted, so a half-filled form survives closing and reopening.
 */
export function RecordPaymentToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button type="button" className="button record-payment-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        Record payment <AppIcon name="chevron-down" />
      </button>
      <div id={id} className="record-payment-panel" data-open={open} inert={!open}>
        <div className="record-payment-inner">{children}</div>
      </div>
    </>
  );
}
