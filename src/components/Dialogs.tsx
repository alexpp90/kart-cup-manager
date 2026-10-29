import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../store/store';
import { useUi } from '../store/ui';
import { IconX } from './Icons';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}

/** Accessible modal: focus moves inside, Tab is trapped, Esc closes. */
export function Modal({ title, onClose, children, footer, wide, className = '' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[1] ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  // Portal to <body>: an animated (transformed) ancestor would otherwise trap position: fixed.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <h2 id="modal-title" className="ribbon">
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <IconX />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmHost() {
  const c = useUi((s) => s.confirm);
  const t = useT();
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [c]);
  if (!c) return null;
  const close = (ok: boolean) => {
    useUi.setState({ confirm: null });
    c.resolve(ok);
  };
  const blocked = c.typeToConfirm !== undefined && typed.trim() !== c.typeToConfirm.trim();
  return (
    <Modal
      title={c.title}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn btn-white" onClick={() => close(false)}>
            {t('common.cancel')}
          </button>
          <button className={`btn ${c.danger ? 'btn-red' : 'btn-green'}`} disabled={blocked} onClick={() => close(true)} data-testid="confirm-ok">
            {c.confirmLabel ?? t('common.confirm')}
          </button>
        </>
      }
    >
      {c.body && <p className="confirm-body">{c.body}</p>}
      {c.typeToConfirm !== undefined && (
        <label className="field">
          <span>{t('dialog.typeToConfirm')}</span>
          <input data-autofocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={c.typeToConfirm} data-testid="confirm-type" />
        </label>
      )}
    </Modal>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast-${x.kind}`}>
          {x.text}
        </div>
      ))}
    </div>
  );
}
