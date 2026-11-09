export type Toast = { id: number; message: string; action?: { label: string; href: string }; tone?: "success" | "notice"; /** Toasts with the same key replace each other instead of stacking. */ key?: string };

/** A check only for successes, so a refusal never looks like success. */
export const toastIcon = (tone?: Toast["tone"]) => (tone === "notice" ? "!" : "✓");

const MAX_TOASTS = 3;

export function pushToast(list: Toast[], toast: Omit<Toast, "id">, id: number): Toast[] {
  const kept = toast.key ? list.filter((item) => item.key !== toast.key) : list;
  return [...kept, { id, ...toast }].slice(-MAX_TOASTS);
}

export function dismissToast(list: Toast[], id: number): Toast[] {
  return list.filter((toast) => toast.id !== id);
}
