import { Fragment, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Card, PosBadge } from '../components/Bits';
import { IconDownload } from '../components/Icons';
import { TieInfo } from '../components/TieInfo';
import { minHeatsForFinals } from '../engine/ranking';
import { finalResults, knockoutTable, leagueTable, previousStandings, standings, type KoCell } from '../engine/tournament';
import { Clover } from '../components/Icons';
import type { Tournament } from '../engine/types';
import { exportCsv } from '../lib/actions';
import { useFlip } from '../lib/flip';
import { roundLabel, stageName } from '../lib/labels';
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
            {t(tour.settings.format === 'knockout' ? 'ko.table' : tour.settings.format === 'league' ? 'league.table' : 'standings.qualifying')}
          </button>
        </div>
      )}
      {tab === 'final' && final ? <FinalTable tour={tour} /> : <LiveTable tour={tour} />}
    </div>
  );
}

/** The live table of the tournament's format. */
export function LiveTable({ tour, limit, big }: { tour: Tournament; limit?: [number, number]; big?: boolean }) {
  if (tour.settings.format === 'knockout') return <KnockoutTable tour={tour} limit={limit} big={big} />;
  if (tour.settings.format === 'league') return <LeagueTable tour={tour} limit={limit} big={big} />;
  return <QualTable tour={tour} limit={limit} big={big} />;
}

/** Rows the TV pages through, per format. */
export function liveRowCount(tour: Tournament): number {
  if (tour.settings.format === 'knockout') return knockoutTable(tour).filter((r) => r.status !== 'withdrawn').length;
  if (tour.settings.format === 'league') return leagueTable(tour).filter((r) => r.cups > 0 && !r.withdrawn).length;
  return standings(tour).filter((r) => r.heats > 0 && !r.withdrawn).length;
}

function LuckyMark() {
  const t = useT();
  return (
    <span className="lucky-mark" title={t('ko.lucky')} aria-label={t('ko.lucky')} role="img">
      <Clover size={16} />
    </span>
  );
}

function KoCellView({ cell }: { cell: KoCell | null }) {
  const t = useT();
  if (!cell) return <span className="muted">·</span>;
  if (cell.mark === 'bye') return <span className="ko-cell ko-bye">{t('ko.bye')}</span>;
  if (cell.mark === 'racing') return <span className="ko-cell muted">…</span>;
  const label = { adv: t('ko.adv'), lucky: t('ko.lucky'), out: t('ko.out'), lc: t('stage.lastChance') }[cell.mark];
  return (
    <span className={`ko-cell ko-${cell.mark}`} title={label}>
      {cell.place}. <small>{cell.points}</small> {cell.mark === 'adv' ? '✓' : cell.mark === 'lucky' ? '🍀' : cell.mark === 'lc' ? 'LC' : ''}
    </span>
  );
}

export function KnockoutTable({ tour, limit, big }: { tour: Tournament; limit?: [number, number]; big?: boolean }) {
  const t = useT();
  const rows = knockoutTable(tour).filter((r) => !big || r.status !== 'withdrawn');
  const shown = limit ? rows.slice(limit[0], limit[1]) : rows;
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const ref = useFlip<HTMLTableSectionElement>(shown.map((r) => r.playerId).join());
  if (!rows.length) {
    return (
      <Card>
        <p className="empty">{t('standings.empty')}</p>
      </Card>
    );
  }
  return (
    <Card className={`table-card ${big ? 'table-big' : ''}`}>
      <table className="standings-table ko-table" data-testid="ko-table">
        <thead>
          <tr>
            <th scope="col">{t('standings.pos')}</th>
            <th scope="col">{t('standings.racer')}</th>
            {tour.rounds.map((r, i) => (
              <th key={r.id} scope="col" className="num">
                {roundLabel(t, tour, i)}
              </th>
            ))}
            <th scope="col">{t('standings.status')}</th>
          </tr>
        </thead>
        <tbody ref={ref}>
          {shown.map((r) => {
            const p = byId.get(r.playerId)!;
            return (
              <tr key={r.playerId} data-flip={r.playerId} className={`${r.status === 'champion' ? 'top-1' : ''} ${r.status === 'withdrawn' ? 'is-withdrawn' : ''} ${r.status === 'in' ? 'is-q' : ''}`}>
                <td>
                  <PosBadge pos={r.position} size={big ? 'lg' : 'md'} />
                </td>
                <td>
                  <div className="name-cell">
                    <Avatar player={p} size={big ? 44 : 34} />
                    <span>
                      <strong>{p.name}</strong>
                      {p.tag && <small className="tag">{p.tag}</small>}
                    </span>
                    {r.lucky && <LuckyMark />}
                  </div>
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} className="num">
                    <KoCellView cell={c} />
                  </td>
                ))}
                <td>
                  {r.status === 'champion' ? (
                    <span className="pill pill-q">🏆 {t('ko.champion')}</span>
                  ) : r.status === 'in' ? (
                    <span className="pill pill-q">{t('ko.in')}</span>
                  ) : r.status === 'withdrawn' ? (
                    <span className="pill pill-withdrawn">{t('standings.withdrawn')}</span>
                  ) : (
                    <span className="pill pill-registered">{t('ko.outIn', { round: roundLabel(t, tour, r.reached) })}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export function LeagueTable({ tour, limit, big }: { tour: Tournament; limit?: [number, number]; big?: boolean }) {
  const t = useT();
  const rows = leagueTable(tour).filter((r) => r.cups > 0 && (!big || !r.withdrawn));
  const shown = limit ? rows.slice(limit[0], limit[1]) : rows;
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const cups = Math.max(tour.settings.leagueCups, tour.rounds.length);
  const ref = useFlip<HTMLTableSectionElement>(shown.map((r) => r.playerId).join());
  if (!rows.length) {
    return (
      <Card>
        <p className="empty">{t('standings.empty')}</p>
      </Card>
    );
  }
  return (
    <Card className={`table-card ${big ? 'table-big' : ''}`}>
      <table className="standings-table league-table" data-testid="league-table">
        <thead>
          <tr>
            <th scope="col">{t('standings.pos')}</th>
            <th scope="col">{t('standings.racer')}</th>
            {Array.from({ length: cups }, (_, i) => (
              <th key={i} scope="col" className="num">
                {t('league.cupShort', { n: i + 1 })}
              </th>
            ))}
            <th scope="col" className="num">{t('standings.points')}</th>
            <th scope="col" className="num">{t('standings.wins')}</th>
            <th scope="col">{t('standings.status')}</th>
          </tr>
        </thead>
        <tbody ref={ref}>
          {shown.map((r) => {
            const p = byId.get(r.playerId)!;
            return (
              <tr key={r.playerId} data-flip={r.playerId} className={`${r.rank <= 3 ? `top-${r.rank}` : ''} ${r.withdrawn ? 'is-withdrawn' : ''}`}>
                <td>
                  <PosBadge pos={r.rank} size={big ? 'lg' : 'md'} />
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
                {r.perCup.map((v, i) => (
                  <td key={i} className="num">
                    {v ?? '·'}
                  </td>
                ))}
                <td className="num avg-cell">
                  <b>{r.total}</b>
                </td>
                <td className="num">{r.wins}</td>
                <td>
                  {r.withdrawn ? (
                    <span className="pill pill-withdrawn">{t('standings.withdrawn')}</span>
                  ) : r.lateStart ? (
                    <span className="pill pill-lc" title={t('league.lateHint')}>
                      {t('league.late')}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
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
  const league = tour.settings.format === 'league' ? new Map(leagueTable(tour).map((r) => [r.playerId, r.total])) : null;
  const reached = (id: string, stage: number) => {
    if (league) return league.get(id) ?? '';
    if (tour.settings.format === 'knockout') return roundLabel(t, tour, stage);
    return stage >= 0 ? stageName(t, tour.finals!.stages[stage].config.name) : t('standings.qualifying');
  };
  return (
    <Card className="table-card">
      <table className="standings-table">
        <thead>
          <tr>
            <th scope="col">{t('standings.place')}</th>
            <th scope="col">{t('standings.racer')}</th>
            <th scope="col">{tour.settings.format === 'league' ? t('standings.points') : t('standings.reachedStage')}</th>
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
                <td>{reached(r.playerId, r.stageReached)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
