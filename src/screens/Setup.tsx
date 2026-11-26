import { useState } from 'react';
import { Card } from '../components/Bits';
import { ItemBox } from '../components/Icons';
import { createTournament, defaultSettings } from '../engine/tournament';
import type { Settings } from '../engine/types';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { newId, tNow, useApp, useT } from '../store/store';

/**
 * A new tournament needs only a name: sign-up starts right away. Heat size,
 * format and race setup are chosen when racing starts, when the number of
 * players is known (Start racing); the rest lives in Settings.
 */
export function Setup() {
  const t = useT();
  const replace = useApp((s) => s.replace);
  const [s, setS] = useState<Settings>(defaultSettings);
  const create = (e?: React.FormEvent) => {
    e?.preventDefault();
    replace(tNow('action.create'), createTournament({ ...s, name: s.name.trim() || 'Kart Cup' }, newId(), Date.now()));
    sound.fanfare();
    go('');
  };
  return (
    <div className="setup setup-simple">
      <h1 className="display page-title">{t('setup.title')}</h1>
      <Card className="card-pop">
        <form className="form-stack" onSubmit={create}>
          <div className="hero-row">
            <ItemBox size={72} className="bob" />
            <p className="muted">{t('setup.simpleHint')}</p>
          </div>
          <div className="form-grid">
            <label className="field field-wide">
              <span>{t('setup.name')}</span>
              <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} data-testid="setup-name" autoFocus />
            </label>
            <label className="field">
              <span>{t('setup.date')}</span>
              <input type="date" value={s.date} onChange={(e) => setS({ ...s, date: e.target.value })} />
            </label>
          </div>
          <button type="submit" className="btn btn-red btn-lg" data-testid="create-tournament">
            {t('setup.createOpen')}
          </button>
        </form>
      </Card>
    </div>
  );
}
