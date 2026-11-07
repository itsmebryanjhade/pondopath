export type Toast = { id: number; message: string; action?: { label: string; href: string } };

const MAX_TOASTS = 3;

export function pushToast(list: Toast[], toast: Omit<Toast, "id">, id: number): Toast[] {
  return [...list, { id, ...toast }].slice(-MAX_TOASTS);
}

export function dismissToast(list: Toast[], id: number): Toast[] {
  return list.filter((toast) => toast.id !== id);
}
