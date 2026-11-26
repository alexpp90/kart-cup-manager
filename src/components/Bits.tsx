import type { ReactNode } from 'react';
import { IconPad } from './Icons';
import type { PlayerStatus } from '../engine/types';
import { useT } from '../store/store';

export function PosBadge({ pos, size = 'md' }: { pos: number; size?: 'sm' | 'md' | 'lg' }) {
  const cls = pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : 'plain';
  return <span className={`pos-badge pos-${cls} pos-${size}`}>{pos}</span>;
}

export function StatusPill({ status }: { status: PlayerStatus }) {
  const t = useT();
  return <span className={`pill pill-${status}`}>{t(`players.status.${status}`)}</span>;
}

export function Card({ title, children, className = '', tone = 'red', actions, id }: { title?: ReactNode; children: ReactNode; className?: string; tone?: 'red' | 'blue' | 'gold' | 'green' | 'navy'; actions?: ReactNode; id?: string }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2 className={`ribbon ribbon-${tone}`}>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Stepper({ value, onChange, min, max, step = 1, label, id }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; id?: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper-btn" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`${label} −`}>
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(clamp(v));
        }}
      />
      <button type="button" className="stepper-btn" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`${label} +`}>
        +
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, testId }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; testId?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function ChoiceCards<V extends string | number>({ value, options, onChange, name, disabled }: { value: V; options: { value: V; label: ReactNode; hint?: ReactNode; icon?: ReactNode }[]; onChange: (v: V) => void; name: string; disabled?: boolean }) {
  return (
    <div className="choices" role="radiogroup">
      {options.map((o) => (
        <label key={String(o.value)} className={`choice ${value === o.value ? 'choice-on' : ''} ${disabled ? 'choice-disabled' : ''}`} data-testid={`${name}-${o.value}`}>
          {/* Clicking the selected option again also counts as a choice (e.g. keep the suggested format). */}
          <input type="radio" name={name} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} onClick={() => value === o.value && onChange(o.value)} />
          {o.icon && <span className="choice-icon">{o.icon}</span>}
          <span className="choice-label">{o.label}</span>
          {o.hint && <small className="choice-hint">{o.hint}</small>}
        </label>
      ))}
    </div>
  );
}

/** The controller a player uses in a heat (1..8). */
export function Seat({ n, big }: { n: number; big?: boolean }) {
  const t = useT();
  return (
    <span className={`seat-chip ${big ? 'seat-chip-big' : ''}`} title={t('seat.label', { n })} aria-label={t('seat.label', { n })} data-testid="seat">
      <IconPad size={big ? 22 : 14} />
      <b>{n}</b>
    </span>
  );
}
