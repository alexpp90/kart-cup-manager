import { AVATARS, COLORS } from '../data/avatars';
import { useT } from '../store/store';
import { Avatar } from './Avatar';

export interface PlayerDraft {
  name: string;
  tag: string;
  favorite: string;
  avatar: string;
  color: string;
}

export function randomDraft(): PlayerDraft {
  return {
    name: '',
    tag: '',
    favorite: '',
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)].id,
    color: COLORS[Math.floor(Math.random() * (COLORS.length - 1))],
  };
}

/** Name, tag, favourite, avatar and color — used by the kiosk and the edit dialog. */
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
      <div className="form-grid">
        <label className="field">
          <span>
            {t('kiosk.tag')} <small>({t('common.optional')})</small>
          </span>
          <input value={draft.tag} maxLength={8} onChange={(e) => set({ tag: e.target.value })} placeholder={t('kiosk.tagPlaceholder')} autoComplete="off" />
        </label>
        <label className="field">
          <span>
            {t('kiosk.favorite')} <small>({t('common.optional')})</small>
          </span>
          <input value={draft.favorite} maxLength={30} onChange={(e) => set({ favorite: e.target.value })} placeholder={t('kiosk.favoritePlaceholder')} autoComplete="off" />
        </label>
      </div>
      <fieldset className="field">
        <legend>{t('kiosk.avatar')}</legend>
        <div className="avatar-grid" role="radiogroup" aria-label={t('kiosk.avatar')}>
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a.id}
              role="radio"
              aria-checked={draft.avatar === a.id}
              aria-label={a.label}
              className={`avatar-choice ${draft.avatar === a.id ? 'on' : ''}`}
              onClick={() => set({ avatar: a.id })}
            >
              <Avatar avatar={a.id} color={draft.color} size={big ? 64 : 44} />
            </button>
          ))}
        </div>
      </fieldset>
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
      </fieldset>
    </div>
  );
}
