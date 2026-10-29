// Transient UI state: confirmation dialogs and toasts (not persisted, not undoable).
import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the user must type this text exactly to enable the confirm button. */
  typeToConfirm?: string;
}

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

interface UiState {
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  toasts: Toast[];
}

export const useUi = create<UiState>(() => ({ confirm: null, toasts: [] }));

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useUi.setState({ confirm: { ...opts, resolve } }));
}

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = ++toastId;
  useUi.setState((s) => ({ toasts: [...s.toasts, { id, text, kind }].slice(-4) }));
  setTimeout(() => useUi.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 3500);
}
