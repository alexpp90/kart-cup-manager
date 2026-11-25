import { useState } from 'react';
import { Card, ChoiceCards, Stepper, Toggle } from '../components/Bits';
import { IconDownload, IconUpload } from '../components/Icons';
import { minHeatsForFinals } from '../engine/ranking';
import type { Settings, TrackMode } from '../engine/types';
import { exportBackup, exportCsv, importBackup, loadDemo } from '../lib/actions';
import { go } from '../lib/router';
import { tNow, useApp, useT } from '../store/store';
import { confirmDialog, toast } from '../store/ui';
import { EstimateCard, PointsEditor } from './Setup';

export function SettingsScreen() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const { apply, replace, prefs, setPrefs, changeSeq, exportSeq, lastExportAt } = useApp();
  const unsaved = changeSeq > exportSeq;
  const [s, setS] = useState<Settings>(tour.settings);
  const patch = (p: Partial<Settings>) => setS((x) => ({ ...x, ...p }));
  const dirty = JSON.stringify(s) !== JSON.stringify(tour.settings);
  const locked = tour.rounds.length > 0;
  const players = Math.max(tour.players.filter((p) => p.status !== 'withdrawn').length, 4);

  const save = () => {
    apply(tNow('action.settings'), (x) => ({ ...x, settings: { ...s, name: s.name.trim() || x.settings.name, qualRounds: Math.max(s.qualRounds, x.rounds.length) } }));
    toast(t('settings.saved'), 'success');
  };
  const reset = async () => {
    const ok = await confirmDialog({ title: t('settings.reset'), body: t('settings.resetHint'), danger: true, typeToConfirm: tour.settings.name, confirmLabel: t('settings.reset') });
    if (!ok) return;
    replace(tNow('action.reset'), null);
    toast(t('settings.resetDone'));
    go('');
  };

  return (
    <div className="settings">
      <div className="page-head">
        <h1 className="display page-title">{t('settings.title')}</h1>
        <span className="muted" data-testid="storage-origin">
          💾 {t('settings.storage')} · {t('settings.origin', { origin: location.protocol === 'file:' ? 'file://' : location.origin })}
        </span>
      </div>
      <div className="settings-grid">
        <div className="settings-main">
          <Card title={t('settings.tournament')} tone="blue">
            <div className="form-grid">
              <label className="field field-wide">
                <span>{t('setup.name')}</span>
                <input value={s.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="field">
                <span>{t('setup.date')}</span>
                <input type="date" value={s.date} onChange={(e) => patch({ date: e.target.value })} />
              </label>
              <div className="field">
                <span>{t('setup.maxPerHeat')}</span>
                <ChoiceCards name="smax" value={s.maxPerHeat} disabled={locked} onChange={(v) => patch({ maxPerHeat: v })} options={[{ value: 8, label: t('setup.max8') }, { value: 4, label: t('setup.max4') }]} />
                {locked && <small>{t('settings.lockedMax')}</small>}
              </div>
              <div className="field">
                <span>{t('setup.races')}</span>
                <Stepper value={s.racesPerHeat} min={1} max={12} onChange={(v) => patch({ racesPerHeat: v })} label={t('setup.races')} />
              </div>
              <div className="field">
                <span>{t('setup.rounds')}</span>
                <Stepper value={s.qualRounds} min={Math.max(1, tour.rounds.length)} max={10} onChange={(v) => patch({ qualRounds: v })} label={t('setup.rounds')} />
                <small>{t('setup.roundsHint', { n: minHeatsForFinals(s.qualRounds) })}</small>
              </div>
            </div>
            <div className="field">
              <span>{t('setup.entryMode')}</span>
              <ChoiceCards name="sentry" value={s.entryMode} onChange={(v) => patch({ entryMode: v })} options={[{ value: 'per-race', label: t('setup.entryPerRace') }, { value: 'totals', label: t('setup.entryTotals') }]} />
            </div>
            <div className="field">
              <span>{t('setup.trackMode')}</span>
              <ChoiceCards<TrackMode> name="strack" value={s.trackMode} onChange={(v) => patch({ trackMode: v })} options={(['none', 'random-cup', 'random-tracks', 'pick'] as const).map((m) => ({ value: m, label: t(`setup.track.${m}`) }))} />
            </div>
            <div className="form-stack">
              <Toggle checked={s.boosterPass} onChange={(v) => patch({ boosterPass: v })} label={t('setup.booster')} />
              <Toggle checked={s.kioskAutoCheckIn} onChange={(v) => patch({ kioskAutoCheckIn: v })} label={t('settings.kioskCheckIn')} />
              <Toggle checked={s.lastChance} onChange={(v) => patch({ lastChance: v })} label={t('setup.lastChance')} hint={t('setup.lastChanceHint')} />
              {s.lastChance && (
                <ChoiceCards name="swc" value={s.lastChanceWildcards} onChange={(v) => patch({ lastChanceWildcards: v })} options={[{ value: 1, label: `1 ${t('finals.wildcard')}` }, { value: 2, label: `2 ${t('finals.wildcards')}` }]} />
              )}
            </div>
            <h3 className="sub-title">{t('setup.pointsTable')}</h3>
            <PointsEditor s={s} patch={patch} />
            <div className="save-bar">
              <button className="btn btn-white" disabled={!dirty} onClick={() => setS(tour.settings)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-green" disabled={!dirty} onClick={save} data-testid="save-settings">
                {t('common.save')}
              </button>
            </div>
          </Card>
        </div>
        <div className="settings-side">
          <EstimateCard s={s} patch={patch} players={players} />
          <Card title={t('settings.data')} tone="green">
            <p className={unsaved ? 'notice notice-warn' : 'muted'}>
              {lastExportAt ? t('settings.lastExport', { when: new Date(lastExportAt).toLocaleString(prefs.lang) }) : t('settings.neverExported')}
              {unsaved && <> · {t('settings.unsaved')}</>}
            </p>
            <div className="btn-col">
              <button className="btn btn-gold" onClick={exportBackup} data-testid="export-json">
                <IconDownload /> {t('settings.export')}
              </button>
              <button className="btn btn-white" onClick={() => void importBackup()} data-testid="import-json">
                <IconUpload /> {t('settings.import')}
              </button>
              <button className="btn btn-white" onClick={exportCsv}>
                <IconDownload /> {t('settings.exportCsv')}
              </button>
            </div>
          </Card>
          <Card title={t('settings.language')} tone="navy">
            <ChoiceCards name="lang" value={prefs.lang} onChange={(v) => setPrefs({ lang: v })} options={[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }]} />
            <Toggle checked={prefs.sound} onChange={(v) => setPrefs({ sound: v })} label={t('settings.sound')} hint={t('settings.soundHint')} testId="sound-toggle" />
          </Card>
          <Card title={t('settings.demo')} tone="gold">
            <p className="muted">{t('settings.demoHint')}</p>
            <button className="btn btn-gold" onClick={() => void loadDemo().then((ok) => ok && go(''))} data-testid="settings-demo">
              {t('settings.demo')}
            </button>
          </Card>
          <Card title={t('settings.danger')} tone="red" className="danger-card">
            <p className="muted">{t('settings.resetHint')}</p>
            <button className="btn btn-red" onClick={() => void reset()} data-testid="reset">
              {t('settings.reset')}
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
