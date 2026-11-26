import { useMemo, useState } from 'react';
import { luckyLosers, previewRound, roundOutcome } from '../engine/tournament';
import { names, roundLabel } from '../lib/labels';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { newId, tNow, useApp, useT } from '../store/store';
import { SuddenDeathCard } from './SuddenDeath';
import { Clover } from './Icons';
import { toast } from '../store/ui';
import { Avatar } from './Avatar';
import { Modal } from './Dialogs';
import { IconShuffle } from './Icons';

/** Preview of the next round with Regenerate / Save. Nothing is stored until Save. */
export function RoundPreview({ onClose }: { onClose: () => void }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const dispatch = useApp((s) => s.dispatch);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const preview = useMemo(() => previewRound(tour, seed, newId, Date.now()), [tour, seed]);
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const n = tour.rounds.length + 1;
  const format = tour.settings.format;
  const title = format === 'league' ? t('rounds.previewCup', { n }) : preview.ok && preview.round.final ? t('rounds.previewFinal') : t('rounds.preview', { n });
  // Only random draws can be redrawn: classic rounds, knockout round 1, the seat order of a league cup.
  const canRedraw = format === 'classic' || (format === 'knockout' && tour.rounds.length === 0) || format === 'league';
  const prev = tour.rounds[tour.rounds.length - 1];
  const lucky = format === 'knockout' && prev ? (() => {
    const o = roundOutcome(tour, prev);
    return new Set(o.status === 'done' ? o.luckyLosers : []);
  })() : luckyLosers(tour);

  if (!preview.ok) {
    return (
      <Modal title={title} onClose={onClose} footer={<button className="btn btn-white" onClick={onClose}>{t('common.close')}</button>}>
        {preview.error === 'tie' && preview.tie ? (
          <SuddenDeathCard tie={preview.tie} body={t('ko.tieBody', { names: names(tour, preview.tie) })} />
        ) : (
          <p className="notice notice-warn">{t(`rounds.err.${preview.error}`, { count: preview.count ?? 0 })}</p>
        )}
      </Modal>
    );
  }
  const save = () => {
    const label = format === 'league' ? tNow('action.cupCreated', { n }) : tNow('action.round', { n });
    dispatch({ type: 'generateRound', seed });
    sound.fanfare();
    toast(label, 'success');
    onClose();
    go('');
  };
  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-white" onClick={onClose}>
            {t('common.cancel')}
          </button>
          {canRedraw && (
            <button className="btn btn-gold" onClick={() => { sound.blip(); setSeed(seed + 7919); }} data-testid="regenerate">
              <IconShuffle size={18} /> {format === 'classic' ? t('rounds.regenerate') : t('rounds.redraw')}
            </button>
          )}
          <button className="btn btn-green" onClick={save} data-testid="save-round" data-autofocus>
            {t('rounds.saveRound')}
          </button>
        </>
      }
    >
      <p className="muted">{format === 'classic' ? t('rounds.previewBody') : format === 'league' ? t('rounds.previewLeague') : tour.rounds.length ? t('rounds.previewSeeded', { prev: roundLabel(t, tour, tour.rounds.length - 1) }) : t('rounds.previewDraw')}</p>
      <div className="preview-stats">
        <span className="chip">{t('common.heats', { n: preview.round.heats.length })}</span>
        <span className="chip">{t('common.players', { n: preview.round.heats.reduce((a, h) => a + h.playerIds.length, 0) })}</span>
        {format === 'knockout' && !preview.round.final && <span className="chip">{t('ko.advanceChip', { x: preview.round.advance ?? 1 })}</span>}
        {format === 'classic' && (
          <span className={`chip ${preview.stats.repeatedPairs ? 'chip-warn' : 'chip-ok'}`}>
            {t('rounds.repeats')}: {preview.stats.repeatedPairs}
          </span>
        )}
        {format === 'classic' && tour.rounds.length > 0 && (
          <span className={`chip ${preview.stats.backToBack ? 'chip-warn' : 'chip-ok'}`}>
            {t('rounds.backToBack')}: {preview.stats.backToBack}
          </span>
        )}
      </div>
      {preview.skipped.length > 0 && <p className="notice notice-warn">{t('rounds.skipped', { n: preview.skipped.length, names: preview.skipped.map((p) => p.name).join(', ') })}</p>}
      {preview.round.byes.length > 0 && <p className="notice">{t(format === 'knockout' ? 'ko.byes' : 'heat.byes', { names: names(tour, preview.round.byes) })}</p>}
      <div className="preview-grid">
        {preview.round.heats.map((h, i) => (
          <div key={h.id} className="preview-heat">
            <h3 className="ribbon ribbon-blue ribbon-sm">{preview.round.final ? t('stage.final') : format === 'league' ? t('heat.cup', { n }) : t('heat.label', { n: i + 1 })}</h3>
            <ul>
              {h.playerIds.map((id) => {
                const p = byId.get(id)!;
                return (
                  <li key={id}>
                    <Avatar player={p} size={24} /> {p.name}
                    {lucky.has(id) && (
                      <span className="lucky-mark" title={t('ko.lucky')} aria-label={t('ko.lucky')} role="img">
                        <Clover size={14} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
