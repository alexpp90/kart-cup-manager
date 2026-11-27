import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Confetti } from '../components/Confetti';
import { CupInfo, Roulette } from '../components/Cup';
import { Flag, ItemBox } from '../components/Icons';
import { PodiumStage } from '../components/PodiumStage';
import { Logo } from '../components/TopBar';
import { bySeat, finalResults, phaseOf, raceOf, registrationOpen, seatsOf, upcoming } from '../engine/tournament';
import { RaceChip } from '../components/RaceFields';
import { QrCode } from '../components/QrCode';
import { JoinQrs } from '../components/JoinQrs';
import { Seat } from '../components/Bits';
import type { CupPick, Heat, Tournament } from '../engine/types';
import { heatTitle, roundLabel } from '../lib/labels';
import { useApp, useT } from '../store/store';
import { listenForState } from '../store/sync';
import { TimeLine } from './Home';
import { FinalTable, LiveTable, liveRowCount } from './Standings';

const PAGE = 10;
type Slide = { kind: 'race' } | { kind: 'standings'; page: number } | { kind: 'podium' } | { kind: 'final' } | { kind: 'grid' };

export function BigScreen() {
  const t = useT();
  const [tour, setTour] = useState<Tournament | null>(null);
  const [join, setJoin] = useState<string | null>(null);
  const [wifi, setWifi] = useState<{ qr: string; ssid: string; password: string } | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  // Bumped on every cup spin so the race slide gets its full time on screen again.
  const [slideNonce, setSlideNonce] = useState(0);
  const [spin, setSpin] = useState<{ heatId: string; pick: CupPick } | null>(null);
  const lastCup = useRef<{ heatId: string; key: string } | null>(null);

  useEffect(() => {
    document.body.classList.add('is-big');
    const stop = listenForState((m) => {
      // This window never autosaves, so it can mirror the state into the store for the shared components.
      useApp.setState({ t: m.t, prefs: { ...useApp.getState().prefs, lang: m.lang } });
      setTour(m.t);
      if (m.join !== undefined) setJoin(m.join);
      if (m.wifi !== undefined) setWifi(m.wifi);
    });
    let idle = 0;
    const onMove = () => {
      document.body.classList.remove('hide-cursor');
      clearTimeout(idle);
      idle = window.setTimeout(() => document.body.classList.add('hide-cursor'), 2000);
    };
    const onDbl = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
    window.addEventListener('mousemove', onMove);
    window.addEventListener('dblclick', onDbl);
    return () => {
      stop();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('dblclick', onDbl);
    };
  }, []);

  const slides: Slide[] = [];
  if (tour) {
    const phase = phaseOf(tour);
    const rows = liveRowCount(tour);
    if (phase === 'podium' && finalResults(tour)) slides.push({ kind: 'podium' }, { kind: 'final' });
    else if (phase === 'registration') slides.push({ kind: 'grid' });
    else {
      if (upcoming(tour).length || !rows) slides.push({ kind: 'race' });
      for (let p = 0; p * PAGE < Math.min(rows, 30); p++) slides.push({ kind: 'standings', page: p });
    }
  }
  const slide = slides[slideIdx % Math.max(1, slides.length)] ?? { kind: 'race' };
  const slideKey = slides.map((s) => s.kind).join();

  useEffect(() => {
    if (slides.length < 2) return;
    const ms = slide.kind === 'race' || slide.kind === 'podium' ? 16000 : 10000;
    const id = setTimeout(() => setSlideIdx((i) => (i + 1) % slides.length), ms);
    return () => clearTimeout(id);
  }, [slideIdx, slideNonce, slideKey, slide.kind, slides.length]);

  // Run the roulette on the TV when the organizer spins a cup for the next heat.
  const now = tour ? upcoming(tour)[0] : undefined;
  useEffect(() => {
    if (!now) return;
    const key = JSON.stringify(now.cup ?? null);
    const prev = lastCup.current;
    lastCup.current = { heatId: now.id, key };
    if (prev && prev.heatId === now.id && prev.key !== key && now.cup) {
      setSpin({ heatId: now.id, pick: now.cup });
      setSlideIdx(0);
      setSlideNonce((n) => n + 1);
    }
  }, [now]);

  if (!tour) {
    return (
      <div className="big">
        <div className="big-center">
          <Logo />
          <p className="big-waiting">{t('big.waiting')}</p>
        </div>
      </div>
    );
  }
  const phase = phaseOf(tour);
  const queue = upcoming(tour);

  return (
    <div className="big" data-testid="big-screen">
      <header className="big-head">
        <Logo small />
        <h1 className="big-name">{tour.settings.name}</h1>
        <span className="big-phase">
          {phase === 'qualifying'
            ? tour.settings.format === 'classic'
              ? `${t('big.qualifying')} · ${t('phase.roundLong', { n: tour.rounds.length })}`
              : `${t(`format.${tour.settings.format}`)} · ${roundLabel(t, tour, tour.rounds.length - 1)}`
            : t(`phase.${phase}`)}
        </span>
      </header>
      <div className="big-stage" key={slideIdx + slide.kind}>
        {slide.kind === 'race' && <RaceSlide tour={tour} now={queue[0]} next={queue[1]} ready={queue[2]} join={join && registrationOpen(tour) ? (wifi?.qr ?? join) : null} />}
        {slide.kind === 'standings' && (
          <div className="big-standings">
            <h2 className="big-title">
              {t('big.standingsTitle')} <small>{t('big.page', { a: slide.page * PAGE + 1, b: Math.min((slide.page + 1) * PAGE, liveRowCount(tour)) })}</small>
            </h2>
            <LiveTable tour={tour} big limit={[slide.page * PAGE, (slide.page + 1) * PAGE]} />
          </div>
        )}
        {slide.kind === 'grid' && (
          <div className="big-grid-slide">
            <h2 className="big-title">
              {t('big.registered')} · {tour.players.length}
            </h2>
            <div className="big-grid">
              {tour.players.map((p) => (
                <div key={p.id} className="big-grid-player">
                  <Avatar player={p} size={96} />
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
            {join ? (
              <div className="big-join big-join-qr" data-testid="big-join-qr">
                {wifi ? (
                  <JoinQrs join={join} wifi={wifi.qr} ssid={wifi.ssid} password={wifi.password} size={240} variant="big" />
                ) : (
                  <>
                    <QrCode text={join} size={220} label={t('phone.qrLabel', { url: join })} />
                    <div>
                      <strong>{t('big.scanToJoin')}</strong>
                      <span>{join.replace(/^https?:\/\//, '')}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="big-join">
                <ItemBox size={64} /> {t('big.joinNow')}
              </p>
            )}
          </div>
        )}
        {slide.kind === 'podium' && (
          <>
            <Confetti burst={slideIdx} />
            <PodiumStage tour={tour} rows={finalResults(tour)!} big />
          </>
        )}
        {slide.kind === 'final' && (
          <div className="big-standings">
            <h2 className="big-title">{t('podium.final')}</h2>
            <FinalTable tour={tour} limit={10} />
          </div>
        )}
      </div>
      {phase !== 'podium' && phase !== 'registration' && <TimeLine tour={tour} big />}
      <div className="big-dots" aria-hidden="true">
        {slides.map((_, i) => (
          <span key={i} className={i === slideIdx % slides.length ? 'on' : ''} />
        ))}
      </div>
      {spin && (
        <div className="big-spin">
          <h2 className="big-title">{heatTitle(t, tour, spin.heatId)}</h2>
          <Roulette pick={spin.pick} boosterPass={tour.settings.boosterPass} big onDone={() => setTimeout(() => setSpin(null), 2500)} />
        </div>
      )}
    </div>
  );
}

function RaceSlide({ tour, now, next, ready, join }: { tour: Tournament; now?: Heat; next?: Heat; ready?: Heat; join: string | null }) {
  const t = useT();
  const byId = new Map(tour.players.map((p) => [p.id, p]));
  if (!now) {
    return (
      <div className="big-center">
        <Flag size={160} />
        <p className="big-waiting">{t('home.noHeat')}</p>
      </div>
    );
  }
  return (
    <div className="big-race">
      <section className="big-now">
        <h2 className="ribbon ribbon-red big-ribbon">{t('home.nowRacing')}</h2>
        <div className="big-heat-title">{heatTitle(t, tour, now.id)}</div>
        <div className="big-race-chip">
          <RaceChip race={raceOf(tour, now.id)} />
        </div>
        <div className={`big-now-players n${now.playerIds.length}`}>
          {bySeat(now).map((id, i) => {
            const p = byId.get(id);
            return p ? (
              <div key={id} className="big-player" style={{ animationDelay: `${i * 90}ms` }}>
                <Seat n={seatsOf(now).get(id)!} big />
                <Avatar player={p} size={120} />
                <span>{p.name}</span>
              </div>
            ) : null;
          })}
        </div>
        {now.cup && (
          <div className="big-cup">
            <CupInfo pick={now.cup} />
          </div>
        )}
      </section>
      <aside className="big-side">
        {[
          { h: next, label: t('home.upNext'), tone: 'blue' },
          { h: ready, label: t('home.getReady'), tone: 'navy' },
        ]
          .filter(({ h }, i) => h || i === 0)
          .map(({ h, label, tone }) => (
          <section key={label} className="big-queue">
            <h3 className={`ribbon ribbon-${tone}`}>{label}</h3>
            {h ? (
              <>
                <div className="big-queue-title">{heatTitle(t, tour, h.id)}</div>
                <ul>
                  {bySeat(h).map((id) => {
                    const p = byId.get(id);
                    return p ? (
                      <li key={id}>
                        <Seat n={seatsOf(h).get(id)!} /> <Avatar player={p} size={44} /> <span className="big-queue-name">{p.name}</span>
                      </li>
                    ) : null;
                  })}
                </ul>
              </>
            ) : (
              <p className="muted">—</p>
            )}
          </section>
        ))}
        {join && (
          <section className="big-queue big-join-small" data-testid="big-join-small">
            <QrCode text={join} size={150} label={t('phone.qrLabel', { url: join })} />
            <strong>{t('big.scanToJoin')}</strong>
          </section>
        )}
      </aside>
    </div>
  );
}
