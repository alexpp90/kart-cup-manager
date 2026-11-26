import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Card, PosBadge, Seat } from '../components/Bits';
import { HeatCup } from '../components/Cup';
import { Flag, IconDownload, IconList, IconTablet, IconTv, ItemBox, Trophy } from '../components/Icons';
import { LateJoiners } from '../components/LateJoiners';
import { RoundPreview } from '../components/RoundPreview';
import { SuddenDeathCard } from '../components/SuddenDeath';
import { PhoneSignupCard } from '../components/PhoneSignup';
import { RaceChip } from '../components/RaceFields';
import { StartRacing } from '../components/StartRacing';
import type { RaceSetup } from '../engine/types';
import { estimateRemaining } from '../engine/timing';
import { bySeat, raceOf, seatsOf, canGenerateRound, currentRound, finalResults, finalsHeats, knockoutTable, leagueTable, leagueTie, phaseOf, roundCandidates, roundComplete, roundHeats, roundOutcome, standings, upcoming } from '../engine/tournament';
import type { Heat, Tournament } from '../engine/types';
import { exportBackup } from '../lib/actions';
import { clockTime, formatDuration, heatTitle, names, nextRoundLabel, roundLabel } from '../lib/labels';
import { bigScreenUrl, go } from '../lib/router';
import { useApp, useT } from '../store/store';

/** Minutes left: heats still to race × the measured time per heat. */
export function remainingMinutes(tour: Tournament, now = Date.now()): number {
  return estimateRemaining(tour, now).minutesLeft;
}

export function Home() {
  const t = useT();
  const tour = useApp((s) => s.t)!;
  const [preview, setPreview] = useState(false);
  const [starting, setStarting] = useState(false);
  const [race, setRace] = useState<RaceSetup | undefined>(undefined);
  const phase = phaseOf(tour);
  const queue = upcoming(tour);
  const [now, next, ready] = queue;
  const candidates = roundCandidates(tour);
  const generateBlocked = canGenerateRound(tour);
  const round = currentRound(tour);
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  const roundQueue = round ? roundHeats(round) : [];
  const heatsDone = tour.finals ? finalsHeats(tour).filter((h) => h.result).length : roundQueue.filter((h) => h.result).length;
  const heatsTotal = tour.finals ? finalsHeats(tour).length : roundQueue.length;
  const format = tour.settings.format;
  const lang = useApp((s) => s.prefs.lang);
  const est = estimateRemaining(tour, Date.now());
  const koTie = format === 'knockout' && round && roundComplete(round) ? (() => {
    const o = roundOutcome(tour, round);
    return o.status === 'tie' ? o.tie : null;
  })() : null;
  const lTie = leagueTie(tour);

  let hero;
  if (now) {
    hero = (
      <Card title={t('home.nowRacing')} className="now-card" tone="red">
        <div className="now-title" data-testid="now-title">
          {heatTitle(t, tour, now.id)}
        </div>
        <div className="now-players">
          {bySeat(now).map((id) => {
            const p = byId.get(id);
            return p ? (
              <div key={id} className="now-player">
                <Seat n={seatsOf(now).get(id)!} />
                <Avatar player={p} size={64} />
                <span>{p.name}</span>
              </div>
            ) : null;
          })}
        </div>
        <div className="now-bottom">
          <RaceChip race={raceOf(tour, now.id)} />
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
            {candidates.length < 2 && <p className="muted">{t('home.needPlayers2')}</p>}
            <div className="btn-row">
              <button className="btn btn-red btn-xl" disabled={candidates.length < 2} onClick={() => setStarting(true)} data-testid="generate-round">
                {t('start.title')}
              </button>
              <button className="btn btn-sky btn-lg" onClick={() => go('join')}>
                <IconTablet /> {t('home.openKiosk')}
              </button>
            </div>
          </div>
        </div>
      </Card>
    );
  } else if (koTie) {
    hero = <SuddenDeathCard tie={koTie} body={t('ko.tieBody', { names: names(tour, koTie) })} />;
  } else if (phase === 'podium' && lTie) {
    hero = <SuddenDeathCard tie={lTie} body={t('league.tieBody', { names: names(tour, lTie) })} />;
  } else if (phase === 'qualifying' && round && roundComplete(round) && format !== 'classic') {
    hero = (
      <Card title={t('home.roundDoneNamed', { name: roundLabel(t, tour, round.index) })} className="now-card" tone="green">
        <div className="hero-row">
          <Flag size={96} className="bob" />
          <div className="btn-row">
            <button className="btn btn-red btn-xl" onClick={() => setPreview(true)} data-testid="generate-round">
              {nextRoundLabel(t, tour)}
            </button>
            <button className="btn btn-white btn-lg" onClick={() => go('standings')}>
              <IconList /> {t('nav.standings')}
            </button>
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
      <Card title={t(format === 'league' ? 'home.leagueDone' : 'home.finalsDone')} className="now-card" tone="gold">
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
          ) : phase === 'registration' ? (
            <PhoneSignupCard />
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
        <div className="stat" data-testid="time-left">
          <span className="stat-num">{formatDuration(t, est.minutesLeft)}</span>
          <span className="stat-label">
            {t('home.stats.left')}
            {est.heatsLeft > 0 && <> · {t('time.ends', { time: clockTime(est.endsAt, lang) })}</>}
          </span>
        </div>
      </div>
      <TimeLine tour={tour} />
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
      {starting && (
        <StartRacing
          onClose={() => setStarting(false)}
          onContinue={(r) => {
            setStarting(false);
            setRace(r);
            setPreview(true);
          }}
        />
      )}
      {preview && <RoundPreview race={race} onClose={() => { setPreview(false); setRace(undefined); }} />}
    </div>
  );
}

/** "≈ 19 min per heat (measured over 4 heats) · 3 heats left · ends ≈ 22:10" and the plan vs. setup. */
export function TimeLine({ tour, big }: { tour: Tournament; big?: boolean }) {
  const t = useT();
  const lang = useApp((s) => s.prefs.lang);
  const est = estimateRemaining(tour, Date.now());
  if (!est.heatsLeft) return null;
  const perHeat = formatDuration(t, est.perHeat);
  return (
    <p className={big ? 'big-time' : 'time-line muted'} data-testid="time-line">
      {est.measured ? t('time.measured', { m: perHeat, n: est.measured }) : t('time.guess', { m: perHeat })} · {t('time.heatsLeft', { n: est.heatsLeft })} · {t('time.ends', { time: clockTime(est.endsAt, lang) })}
    </p>
  );
}

function TopFive({ tour }: { tour: Tournament }) {
  const t = useT();
  const final = finalResults(tour);
  const format = tour.settings.format;
  const rows = final
    ? final.slice(0, 5).map((r) => ({ playerId: r.playerId, rank: r.place, value: '' }))
    : format === 'league'
      ? leagueTable(tour)
          .filter((r) => r.cups > 0 && !r.withdrawn)
          .slice(0, 5)
          .map((r) => ({ playerId: r.playerId, rank: r.rank, value: String(r.total) }))
      : format === 'knockout'
        ? knockoutTable(tour)
            .filter((r) => r.status === 'in')
            .slice(0, 5)
            .map((r, i) => ({ playerId: r.playerId, rank: i + 1, value: r.cells[r.reached]?.points !== undefined ? String(r.cells[r.reached]!.points) : '' }))
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
            {bySeat(heat).map((id) => {
              const p = byId.get(id);
              return p ? (
                <li key={id}>
                  <Seat n={seatsOf(heat).get(id)!} /> <Avatar player={p} size={26} /> {p.name}
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
