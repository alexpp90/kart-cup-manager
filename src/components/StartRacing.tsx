// "Start racing": now that everyone has signed up, choose the heat size, the
// format (suggested from the real number of players) and how round 1 is raced.
import { useState } from 'react';
import { suggestFormat } from '../engine/plan';
import { roundCandidates } from '../engine/tournament';
import type { RaceSetup, Settings } from '../engine/types';
import { useApp, useT } from '../store/store';
import { Toggle } from './Bits';
import { Modal } from './Dialogs';
import { FormatFields, PlanCard } from './Planner';
import { RaceFields } from './RaceFields';

export function StartRacing({ onClose, onContinue }: { onClose: () => void; onContinue: (race: RaceSetup) => void }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const dispatch = useApp((s) => s.dispatch);
  const players = roundCandidates(tour).length;
  const waiting = tour.players.filter((p) => p.status === 'registered').length;
  const [s, setS] = useState<Settings>(() => ({ ...tour.settings, format: tour.settings.formatAuto ? suggestFormat(players, tour.settings.heatSize) : tour.settings.format }));
  const patch = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));
  const go = () => {
    dispatch({ type: 'updateSettings', settings: s });
    onContinue(s.race);
  };
  return (
    <Modal
      wide
      title={t('start.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-white" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-red btn-lg" onClick={go} disabled={players < 2} data-testid="start-continue">
            {t('start.continue')}
          </button>
        </>
      }
    >
      <div className="start-grid">
        <div className="form-stack">
          <p className="start-count" data-testid="start-count">
            {t('start.players', { n: players })}
          </p>
          {waiting > 0 && <p className="notice notice-warn">{t('start.notChecked', { n: waiting })}</p>}
          <FormatFields s={s} patch={patch} players={players} />
          <h3 className="sub-title">{t('start.firstRound')}</h3>
          <RaceFields race={s.race} onChange={(race) => patch({ race })} name="start-race" />
          <Toggle checked={s.lateSignups} onChange={(v) => patch({ lateSignups: v })} label={t('start.late')} hint={t('start.lateHint')} testId="late-signups" />
        </div>
        <PlanCard s={s} players={players} onApply={patch} />
      </div>
    </Modal>
  );
}
