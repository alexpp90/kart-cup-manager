import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Card, PosBadge } from '../components/Bits';
import { HeatCup } from '../components/Cup';
import { Flag, IconDownload, IconList, IconTablet, IconTv, ItemBox, Trophy } from '../components/Icons';
import { LateJoiners } from '../components/LateJoiners';
import { RoundPreview } from '../components/RoundPreview';
import { splitHeatSizes } from '../engine/heats';
import { estimateDuration } from '../engine/schedule';
import { canGenerateRound, currentRound, finalResults, finalsHeats, phaseOf, roundCandidates, roundComplete, standings, upcoming } from '../engine/tournament';
import type { Heat, Tournament } from '../engine/types';
import { exportBackup } from '../lib/actions';
import { formatDuration, heatTitle } from '../lib/labels';
import { bigScreenUrl, go } from '../lib/router';
import { useApp, useT } from '../store/store';

export function remainingMinutes(tour: Tournament): number {
  const s = tour.settings;
  const perHeat = s.racesPerHeat * s.minutesPerRace + s.changeoverMinutes;
  const split = splitHeatSizes(roundCandidates(tour).length, s.maxPerHeat);
  const perRound = split.ok ? split.sizes.length : 0;
  let heats = upcoming(tour).length;
  if (!tour.finals) {
    heats += Math.max(0, s.qualRounds - tour.rounds.length) * perRound;
    heats += estimateDuration(roundCandidates(tour).length, s).finalsHeats;
  } else {
    heats += tour.finals.stages.filter((st) => !st.heats.length).reduce((a, st) => a + st.config.fieldSize / st.config.heatSize, 0);
  }
  return heats * perHeat;
}

export function Home() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const [preview, setPreview] = useState(false);
  const phase = phaseOf(tour);
  const queue = upcoming(tour);
  const [now, next, ready] = queue;
  const candidates = roundCandidates(tour);
  const generateBlocked = canGenerateRound(tour);
  const round = currentRound(tour);
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const heatsDone = tour.finals ? finalsHeats(tour).filter((h) => h.result).length : round ? round.heats.filter((h) => h.result).length : 0;
  const heatsTotal = tour.finals ? finalsHeats(tour).length : round?.heats.length ?? 0;

  let hero;
  if (now) {
    hero = (
      <Card title={t('home.nowRacing')} className="now-card" tone="red">
        <div className="now-title" data-testid="now-title">
          {heatTitle(t, tour, now.id)}
        </div>
        <div className="now-players">
          {now.playerIds.map((id) => {
            const p = byId.get(id);
            return p ? (
              <div key={id} className="now-player">
                <Avatar player={p} size={64} />
                <span>{p.name}</span>
              </div>
            ) : null;
          })}
        </div>
        <div className="now-bottom">
          <HeatCup tour={tour} heat={now} />
          <button className="btn btn-red btn-xl" onClick={() => go(`heat/${now.id}`)} data-testid="home-enter">
            {t('home.enterResults')}
          </button>
        </div>
      </Card>
    );
  } else if (phase === 'registration') {
    hero = (
      <Card title={t('home.registrationOpen')} className="now-card" tone="green">
        <div className="hero-row">
          <ItemBox size={96} className="bob" />
          <div>
            <div className="now-title">{t('home.registrationBody', { n: tour.players.length, c: candidates.length })}</div>
            {candidates.length < 3 && <p className="muted">{t('home.needPlayers')}</p>}
            <div className="btn-row">
              <button className="btn btn-red btn-xl" disabled={candidates.length < 3} onClick={() => setPreview(true)} data-testid="generate-round">
                {t('home.generateFirst')}
              </button>
              <button className="btn btn-sky btn-lg" onClick={() => go('join')}>
                <IconTablet /> {t('home.openKiosk')}
              </button>
            </div>
          </div>
        </div>
      </Card>
    );
  } else if (phase === 'qualifying' && round && roundComplete(round)) {
    const more = !generateBlocked;
    hero = (
      <Card title={more ? t('home.roundDone', { n: round.index + 1 }) : t('home.qualDone')} className="now-card" tone="green">
        <div className="hero-row">
          <Flag size={96} className="bob" />
          <div className="btn-row">
            {more ? (
              <button className="btn btn-red btn-xl" onClick={() => setPreview(true)} data-testid="generate-round">
                {t('home.generateNext', { n: tour.rounds.length + 1 })}
              </button>
            ) : (
              <button className="btn btn-red btn-xl" onClick={() => go('finals')} data-testid="goto-finals">
                {t('home.startFinals')}
              </button>
            )}
            <button className="btn btn-white btn-lg" onClick={() => go('standings')}>
              <IconList /> {t('nav.standings')}
            </button>
          </div>
        </div>
      </Card>
    );
  } else if (phase === 'podium') {
    hero = (
      <Card title={t('home.finalsDone')} className="now-card" tone="gold">
        <div className="hero-row">
          <Trophy size={110} className="bob" />
          <button className="btn btn-red btn-xl" onClick={() => go('podium')} data-testid="goto-podium">
            {t('home.toPodium')}
          </button>
        </div>
      </Card>
    );
  } else {
    hero = (
      <Card title={t('home.nowRacing')} className="now-card">
        <p className="muted">{t('home.noHeat')}</p>
      </Card>
    );
  }

  return (
    <div className="home">
      <LateJoiners />
      <div className="home-grid">
        <div className="home-hero">{hero}</div>
        <div className="home-side">
          {next ? (
            <>
              <QueueCard title={t('home.upNext')} heat={next} tour={tour} tone="blue" />
              <QueueCard title={t('home.getReady')} heat={ready} tour={tour} tone="navy" />
            </>
          ) : (
            <TopFive tour={tour} />
          )}
        </div>
      </div>
      <div className="stats-row">
        <div className="stat">
          <span className="stat-num">{tour.players.filter((p) => p.status !== 'withdrawn').length}</span>
          <span className="stat-label">{t('home.stats.players')}</span>
        </div>
        <div className="stat">
          <span className="stat-num">
            {heatsDone}/{heatsTotal}
          </span>
          <span className="stat-label">{t('home.stats.heats')}</span>
        </div>
        <div className="stat">
          <span className="stat-num">{formatDuration(t, remainingMinutes(tour))}</span>
          <span className="stat-label">{t('home.stats.left')}</span>
        </div>
      </div>
      <div className="quick-actions" role="group" aria-label={t('home.quick')}>
        <button className="btn btn-white" onClick={() => go('join')}>
          <IconTablet /> {t('home.openKiosk')}
        </button>
        <button className="btn btn-white" onClick={() => window.open(bigScreenUrl(), 'kart-cup-big-screen', 'popup,width=1280,height=720')}>
          <IconTv /> {t('nav.bigScreen')}
        </button>
        <button className="btn btn-white" onClick={() => go('standings')}>
          <IconList /> {t('nav.standings')}
        </button>
        <button className="btn btn-white" onClick={exportBackup}>
          <IconDownload /> {t('settings.export')}
        </button>
      </div>
      {preview && <RoundPreview onClose={() => setPreview(false)} />}
    </div>
  );
}

function TopFive({ tour }: { tour: Tournament }) {
  const t = useT();
  const final = finalResults(tour);
  const rows = final
    ? final.slice(0, 5).map((r) => ({ playerId: r.playerId, rank: r.place, value: '' }))
    : standings(tour)
        .filter((r) => r.heats > 0 && !r.withdrawn)
        .slice(0, 5)
        .map((r) => ({ playerId: r.playerId, rank: r.rank, value: r.avg.toFixed(1) }));
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  return (
    <Card title={final ? t('standings.final') : t('big.standingsTitle')} tone="gold" className="queue-card">
      {rows.length ? (
        <ol className="top-five">
          {rows.map((r) => {
            const p = byId.get(r.playerId)!;
            return (
              <li key={r.playerId}>
                <PosBadge pos={r.rank} size="sm" />
                <Avatar player={p} size={28} />
                <span className="top-five-name">{p.name}</span>
                <b>{r.value}</b>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">{t('standings.empty')}</p>
      )}
      <button className="btn btn-sm btn-white" onClick={() => go('standings')}>
        {t('nav.standings')} →
      </button>
    </Card>
  );
}

function QueueCard({ title, heat, tour, tone }: { title: string; heat?: Heat; tour: Tournament; tone: 'blue' | 'navy' }) {
  const t = useT();
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  return (
    <Card title={title} tone={tone} className="queue-card">
      {heat ? (
        <>
          <div className="queue-title">{heatTitle(t, tour, heat.id)}</div>
          <ul className="queue-players">
            {heat.playerIds.map((id) => {
              const p = byId.get(id);
              return p ? (
                <li key={id}>
                  <Avatar player={p} size={26} /> {p.name}
                </li>
              ) : null;
            })}
          </ul>
        </>
      ) : (
        <p className="muted">{t('home.noHeat')}</p>
      )}
    </Card>
  );
}
