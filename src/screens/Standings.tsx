import { Fragment, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Card, PosBadge } from '../components/Bits';
import { IconDownload } from '../components/Icons';
import { TieInfo } from '../components/TieInfo';
import { minHeatsForFinals } from '../engine/ranking';
import { finalResults, previousStandings, standings } from '../engine/tournament';
import type { Tournament } from '../engine/types';
import { exportCsv } from '../lib/actions';
import { useFlip } from '../lib/flip';
import { stageName } from '../lib/labels';
import { qualificationMarks } from '../lib/qualification';
import { useApp, useT } from '../store/store';

export function Standings() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const final = finalResults(tour);
  const [tab, setTab] = useState<'qual' | 'final'>(final ? 'final' : 'qual');
  return (
    <div className="standings">
      <div className="page-head">
        <h1 className="display page-title">{t('standings.title')}</h1>
        <button className="btn btn-white" onClick={exportCsv} data-testid="export-csv">
          <IconDownload /> {t('standings.exportCsv')}
        </button>
      </div>
      {final && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'final'} className={`tab ${tab === 'final' ? 'on' : ''}`} onClick={() => setTab('final')}>
            {t('standings.final')}
          </button>
          <button role="tab" aria-selected={tab === 'qual'} className={`tab ${tab === 'qual' ? 'on' : ''}`} onClick={() => setTab('qual')}>
            {t('standings.qualifying')}
          </button>
        </div>
      )}
      {tab === 'final' && final ? <FinalTable tour={tour} /> : <QualTable tour={tour} />}
    </div>
  );
}

export function QualTable({ tour, limit, big }: { tour: Tournament; limit?: [number, number]; big?: boolean }) {
  const t = useT();
  const all = standings(tour);
  const prev = previousStandings(tour);
  const prevPos = new Map(prev?.map((r) => [r.playerId, r]) ?? []);
  const marks = qualificationMarks(tour);
  // The TV leaderboard only shows racers still in the event; the organizer table keeps everyone.
  const rows = all.filter((r) => !big || (r.heats > 0 && !r.withdrawn));
  const shown = limit ? rows.slice(limit[0], limit[1]) : rows;
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const minHeats = minHeatsForFinals(tour.settings.qualRounds);
  const ref = useFlip<HTMLTableSectionElement>(shown.map((r) => r.playerId).join());
  // Cut line goes below the last direct qualifier / last Last Chance player.
  const directIds = [...marks.direct];
  const lastDirect = directIds.length ? rows.reduce((acc, r, i) => (marks.direct.has(r.playerId) ? i : acc), -1) : -1;
  const lastLc = rows.reduce((acc, r, i) => (marks.lastChance.has(r.playerId) ? i : acc), -1);

  if (!all.some((r) => r.heats > 0)) {
    return (
      <Card>
        <p className="empty">{t('standings.empty')}</p>
      </Card>
    );
  }
  return (
    <Card className={`table-card ${big ? 'table-big' : ''}`}>
      <table className="standings-table">
        <thead>
          <tr>
            <th scope="col">{t('standings.pos')}</th>
            <th scope="col" className="arrow-col">
              <span className="sr-only">▲▼</span>
            </th>
            <th scope="col">{t('standings.racer')}</th>
            <th scope="col" className="num">{t('standings.heats')}</th>
            <th scope="col" className="num">{t('standings.points')}</th>
            <th scope="col" className="num">{t('standings.avg')}</th>
            <th scope="col" className="num">{t('standings.wins')}</th>
            {!big && <th scope="col" className="num">{t('standings.best')}</th>}
            <th scope="col">{t('standings.status')}</th>
          </tr>
        </thead>
        <tbody ref={ref}>
          {shown.map((r) => {
            const p = byId.get(r.playerId)!;
            const idx = rows.indexOf(r);
            const before = prevPos.get(r.playerId);
            const delta = before && before.heats > 0 ? before.position - r.position : null;
            const isNew = prev && (!before || before.heats === 0) && r.heats > 0;
            const status = r.withdrawn ? (
              <span className="pill pill-withdrawn">{t('standings.withdrawn')}</span>
            ) : marks.direct.has(r.playerId) ? (
              <span className="pill pill-q">🏁 {t('standings.q')}</span>
            ) : marks.lastChance.has(r.playerId) ? (
              <span className="pill pill-lc">{t('standings.lc')}</span>
            ) : r.eligible ? (
              <span className="pill pill-eligible">{t('standings.eligible')}</span>
            ) : (
              <span className="pill pill-registered">{t('standings.needMore', { n: Math.max(0, minHeats - r.heats) })}</span>
            );
            return (
              <Fragment key={r.playerId}>
                <tr data-flip={r.playerId} className={`${r.rank <= 3 ? `top-${r.rank}` : ''} ${r.withdrawn ? 'is-withdrawn' : ''} ${marks.direct.has(r.playerId) ? 'is-q' : ''}`}>
                  <td>
                    <PosBadge pos={r.rank} size={big ? 'lg' : 'md'} />
                  </td>
                  <td className="arrow-col">
                    {delta !== null && delta > 0 && <span className="move-up" aria-label={t('standings.moved', { dir: t('standings.up'), n: delta })}>▲{delta}</span>}
                    {delta !== null && delta < 0 && <span className="move-down" aria-label={t('standings.moved', { dir: t('standings.down'), n: -delta })}>▼{-delta}</span>}
                    {delta === 0 && <span className="move-same" aria-hidden="true">–</span>}
                    {isNew && <span className="move-new">{t('standings.new')}</span>}
                  </td>
                  <td>
                    <div className="name-cell">
                      <Avatar player={p} size={big ? 44 : 34} />
                      <span>
                        <strong>{p.name}</strong>
                        {p.tag && <small className="tag">{p.tag}</small>}
                      </span>
                    </div>
                  </td>
                  <td className="num">{r.heats}</td>
                  <td className="num">{r.total}</td>
                  <td className="num avg-cell">
                    <b>{r.heats ? r.avg.toFixed(1) : '–'}</b>
                    {!big && <TieInfo tour={tour} row={r} />}
                  </td>
                  <td className="num">{r.wins}</td>
                  {!big && <td className="num">{r.best}</td>}
                  <td>{status}</td>
                </tr>
                {idx === lastDirect && marks.cut > 0 && (
                  <tr className="cut-row" aria-hidden="true">
                    <td colSpan={big ? 8 : 9}>
                      <span>{t('standings.cut', { n: marks.cut })}</span>
                    </td>
                  </tr>
                )}
                {idx === lastLc && marks.lcCount > 0 && (
                  <tr className="cut-row cut-lc" aria-hidden="true">
                    <td colSpan={big ? 8 : 9}>
                      <span>{t('standings.lcCut', { n: marks.lcCount })}</span>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export function FinalTable({ tour, limit }: { tour: Tournament; limit?: number }) {
  const t = useT();
  const rows = finalResults(tour) ?? [];
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  return (
    <Card className="table-card">
      <table className="standings-table">
        <thead>
          <tr>
            <th scope="col">{t('standings.place')}</th>
            <th scope="col">{t('standings.racer')}</th>
            <th scope="col">{t('standings.reachedStage')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => {
            const p = byId.get(r.playerId)!;
            return (
              <tr key={r.playerId} className={r.place <= 3 ? `top-${r.place}` : ''}>
                <td>
                  <PosBadge pos={r.place} />
                </td>
                <td>
                  <div className="name-cell">
                    <Avatar player={p} size={34} />
                    <strong>{p.name}</strong>
                    {p.tag && <small className="tag">{p.tag}</small>}
                  </div>
                </td>
                <td>{r.stageReached >= 0 ? stageName(t, tour.finals!.stages[r.stageReached].config.name) : t('standings.qualifying')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
