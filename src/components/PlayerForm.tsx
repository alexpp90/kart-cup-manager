import { COLORS } from '../data/colors';
import { pickColor } from '../engine/color';
import type { Player } from '../engine/types';
import { useT } from '../store/store';

export interface PlayerDraft {
  name: string;
  tag: string;
  color: string;
}

/** An empty sign-up with the least-used badge colour preselected. */
export function newDraft(players: Pick<Player, 'color' | 'status'>[] = []): PlayerDraft {
  return { name: '', tag: '', color: pickColor(players) };
}

/**
 * Name, gamer tag and badge colour: used by the kiosk and the edit dialog.
 * No character choice: everyone picks their character on the console.
 */
export function PlayerForm({ draft, onChange, error, big, autoFocus }: { draft: PlayerDraft; onChange: (d: PlayerDraft) => void; error?: string; big?: boolean; autoFocus?: boolean }) {
  const t = useT();
  const set = (p: Partial<PlayerDraft>) => onChange({ ...draft, ...p });
  return (
    <div className={`player-form ${big ? 'player-form-big' : ''}`}>
      <label className="field field-wide">
        <span>{t('kiosk.name')}</span>
        <input
          value={draft.name}
          maxLength={24}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t('kiosk.namePlaceholder')}
          autoComplete="off"
          autoFocus={autoFocus}
          data-autofocus
          aria-invalid={!!error}
          aria-describedby={error ? 'name-error' : undefined}
          data-testid="player-name"
        />
        {error && (
          <span className="field-error" id="name-error" role="alert">
            {error}
          </span>
        )}
      </label>
      <label className="field">
        <span>
          {t('kiosk.tag')} <small>({t('common.optional')})</small>
        </span>
        <input value={draft.tag} maxLength={8} onChange={(e) => set({ tag: e.target.value })} placeholder={t('kiosk.tagPlaceholder')} autoComplete="off" data-testid="player-tag" />
      </label>
      <fieldset className="field">
        <legend>{t('kiosk.color')}</legend>
        <div className="color-grid" role="radiogroup" aria-label={t('kiosk.color')}>
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={draft.color === c}
              aria-label={c}
              className={`color-choice ${draft.color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => set({ color: c })}
            />
          ))}
        </div>
        <small>{t('kiosk.colorHint')}</small>
      </fieldset>
    </div>
  );
}
