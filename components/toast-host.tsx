"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dismissToast, pushToast, toastIcon, type Toast } from "@/lib/ui/toasts";

const TOAST_MS = 5000;
type ToastApi = { show: (message: string, action?: Toast["action"], tone?: Toast["tone"], key?: string) => void };
const ToastContext = createContext<ToastApi>({ show: () => {} });

export const useToast = () => useContext(ToastContext);

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);
  return (
    <div className="toast">
      <span className={`toast-check ${toast.tone ?? "success"}`} aria-hidden="true">{toastIcon(toast.tone)}</span>
      <span className="toast-message">{toast.message}</span>
      {toast.action && <Link className="toast-action" href={toast.action.href} onClick={() => onDismiss(toast.id)}>{toast.action.label}</Link>}
      <button type="button" className="toast-dismiss" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>×</button>
    </div>
  );
}

/** One polite status region for short confirmations. Toasts never take focus and disappear after about 5 seconds. */
export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((list) => dismissToast(list, id)), []);
  const api = useMemo<ToastApi>(() => ({
    show: (message, action, tone, key) => setToasts((list) => pushToast(list, { message, action, tone, key }, nextId.current++)),
  }), []);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}
