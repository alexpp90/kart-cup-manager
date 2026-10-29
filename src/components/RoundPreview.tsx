import { useMemo, useState } from 'react';
import { commitRound, previewRound } from '../engine/tournament';
import { names } from '../lib/labels';
import { go } from '../lib/router';
import { sound } from '../lib/sound';
import { newId, tNow, useApp, useT } from '../store/store';
import { toast } from '../store/ui';
import { Avatar } from './Avatar';
import { Modal } from './Dialogs';
import { IconShuffle } from './Icons';

/** Preview of the next round with Regenerate / Save. Nothing is stored until Save. */
export function RoundPreview({ onClose }: { onClose: () => void }) {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const apply = useApp((s) => s.apply);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const preview = useMemo(() => previewRound(tour, seed, newId, Date.now()), [tour, seed]);
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const n = tour.rounds.length + 1;

  if (!preview.ok) {
    return (
      <Modal title={t('rounds.preview', { n })} onClose={onClose} footer={<button className="btn btn-white" onClick={onClose}>{t('common.close')}</button>}>
        <p className="notice notice-warn">{t(`rounds.err.${preview.error}`, { count: preview.count ?? 0 })}</p>
      </Modal>
    );
  }
  const save = () => {
    apply(tNow('action.round', { n }), (x) => commitRound(x, preview.round));
    sound.fanfare();
    toast(tNow('action.round', { n }), 'success');
    onClose();
    go('');
  };
  return (
    <Modal
      wide
      title={t('rounds.preview', { n })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-white" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-gold" onClick={() => { sound.blip(); setSeed(seed + 7919); }} data-testid="regenerate">
            <IconShuffle size={18} /> {t('rounds.regenerate')}
          </button>
          <button className="btn btn-green" onClick={save} data-testid="save-round" data-autofocus>
            {t('rounds.saveRound')}
          </button>
        </>
      }
    >
      <p className="muted">{t('rounds.previewBody')}</p>
      <div className="preview-stats">
        <span className="chip">{t('common.heats', { n: preview.round.heats.length })}</span>
        <span className="chip">{t('common.players', { n: preview.round.heats.reduce((a, h) => a + h.playerIds.length, 0) })}</span>
        <span className={`chip ${preview.stats.repeatedPairs ? 'chip-warn' : 'chip-ok'}`}>
          {t('rounds.repeats')}: {preview.stats.repeatedPairs}
        </span>
        {tour.rounds.length > 0 && (
          <span className={`chip ${preview.stats.backToBack ? 'chip-warn' : 'chip-ok'}`}>
            {t('rounds.backToBack')}: {preview.stats.backToBack}
          </span>
        )}
      </div>
      {preview.skipped.length > 0 && <p className="notice notice-warn">{t('rounds.skipped', { n: preview.skipped.length, names: preview.skipped.map((p) => p.name).join(', ') })}</p>}
      {preview.round.byes.length > 0 && <p className="notice">{t('heat.byes', { names: names(tour, preview.round.byes) })}</p>}
      <div className="preview-grid">
        {preview.round.heats.map((h, i) => (
          <div key={h.id} className="preview-heat">
            <h3 className="ribbon ribbon-blue ribbon-sm">{t('heat.label', { n: i + 1 })}</h3>
            <ul>
              {h.playerIds.map((id) => {
                const p = byId.get(id)!;
                return (
                  <li key={id}>
                    <Avatar player={p} size={24} /> {p.name}
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
