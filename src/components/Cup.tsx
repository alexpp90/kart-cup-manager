import { useEffect, useRef, useState } from 'react';
import { CUPS, type Cup } from '../data/cups';
import { cupPool, trackPool } from '../engine/cups';
import { randomCupFor } from '../engine/tournament';
import type { CupPick, Heat, Tournament } from '../engine/types';
import { prefersReducedMotion, sound } from '../lib/sound';
import { useApp, useT } from '../store/store';
import { Modal } from './Dialogs';
import { IconShuffle } from './Icons';
import { CupGlyph, Glyph } from './Glyphs';

const cupById = (id: string) => CUPS.find((c) => c.id === id);
const trackName = (id: string) => {
  const [cupId, idx] = id.split(':');
  return cupById(cupId)?.tracks[Number(idx)] ?? id;
};

const HUES: Record<string, string> = {};
CUPS.forEach((c, i) => (HUES[c.id] = `hsl(${(i * 47) % 360} 85% 55%)`));

/** Original cup emblem: a rounded shield in the cup's hue with its glyph. */
export function CupEmblem({ cup, size = 56 }: { cup: Cup; size?: number }) {
  return (
    <span className="cup-emblem" style={{ width: size, height: size, ['--hue' as string]: HUES[cup.id] }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <path d="M10 10h44v14c0 15-10 26-22 30C20 50 10 39 10 24z" fill="var(--hue)" stroke="#14213D" strokeWidth="4" strokeLinejoin="round" />
        <path d="M16 15h10" stroke="#fff" strokeOpacity=".6" strokeWidth="4" strokeLinecap="round" />
        {cup.booster && <circle cx="51" cy="13" r="7" fill="#FFC81E" stroke="#14213D" strokeWidth="3" />}
      </svg>
      <span className="cup-glyph">
        <CupGlyph id={cup.id} size={Math.round(size * 0.5)} />
      </span>
    </span>
  );
}

export function CupInfo({ pick, compact }: { pick: CupPick; compact?: boolean }) {
  const t = useT();
  if (pick.kind === 'cup') {
    const cup = cupById(pick.cupId);
    if (!cup) return null;
    return (
      <div className={`cup-info ${compact ? 'cup-compact' : ''}`}>
        <CupEmblem cup={cup} size={compact ? 36 : 56} />
        <div>
          <strong className="cup-name">{cup.name}</strong>
          {!compact && <ol className="cup-tracks">{cup.tracks.map((tr) => <li key={tr}>{tr}</li>)}</ol>}
        </div>
      </div>
    );
  }
  return (
    <div className={`cup-info ${compact ? 'cup-compact' : ''}`}>
      <span className="cup-emblem cup-emblem-tracks" aria-hidden="true">
        <Glyph name="flag" size={compact ? 30 : 44} />
      </span>
      <div>
        <strong className="cup-name">{t('heat.tracks')}</strong>
        <ol className="cup-tracks">{pick.trackIds.map((id) => <li key={id}>{trackName(id)}</li>)}</ol>
      </div>
    </div>
  );
}

interface ReelItem {
  key: string;
  /** The cup whose emblem symbol is shown. */
  cupId: string;
  title: string;
}

function reelItems(pick: CupPick, boosterPass: boolean): { pool: ReelItem[]; finals: ReelItem[] } {
  const cups = cupPool(CUPS, boosterPass);
  if (pick.kind === 'cup') {
    const c = cupById(pick.cupId)!;
    return { pool: cups.map((x) => ({ key: x.id, cupId: x.id, title: x.name })), finals: [{ key: c.id, cupId: c.id, title: c.name }] };
  }
  const tracks = trackPool(cups);
  return {
    pool: tracks.map((x) => ({ key: x.id, cupId: x.cupId, title: x.name })),
    finals: pick.trackIds.map((id) => ({ key: id, cupId: id.split(':')[0], title: trackName(id) })),
  };
}

/** Slot-machine style ticker that slows down and lands on the pick. */
export function Roulette({ pick, boosterPass, onDone, big }: { pick: CupPick; boosterPass: boolean; onDone?: () => void; big?: boolean }) {
  const { pool, finals } = reelItems(pick, boosterPass);
  const [slot, setSlot] = useState(0);
  const [shown, setShown] = useState<ReelItem>(pool[0]);
  const [landed, setLanded] = useState<ReelItem[]>([]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setLanded(finals);
      setSlot(finals.length);
      const id = setTimeout(() => doneRef.current?.(), 400);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    const timers: number[] = [];
    const runSlot = (s: number) => {
      if (s >= finals.length) {
        timers.push(window.setTimeout(() => !cancelled && doneRef.current?.(), 900));
        return;
      }
      setSlot(s);
      const steps = finals.length > 1 ? 12 : 22;
      let delay = 0;
      for (let k = 0; k < steps; k++) {
        delay += (finals.length > 1 ? 35 : 45) * Math.pow(1.13, k);
        const last = k === steps - 1;
        timers.push(
          window.setTimeout(() => {
            if (cancelled) return;
            setShown(last ? finals[s] : pool[Math.floor(Math.random() * pool.length)]);
            if (last) {
              sound.success();
              setLanded((l) => [...l, finals[s]]);
              timers.push(window.setTimeout(() => runSlot(s + 1), 450));
            } else sound.tick();
          }, delay),
        );
      }
    };
    runSlot(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pick)]);

  const spinning = slot < finals.length && landed.length <= slot;
  return (
    <div className={`roulette ${big ? 'roulette-big' : ''}`}>
      <div className={`reel ${spinning ? 'reel-spinning' : 'reel-landed'}`} aria-live="polite">
        <span key={shown.key + slot + landed.length} className="reel-item">
          <span className="reel-glyph">
            <CupGlyph id={(spinning ? shown : (landed[landed.length - 1] ?? shown)).cupId} size={big ? 96 : 56} />
          </span>
          <span className="reel-title">{spinning ? shown.title : (landed[landed.length - 1] ?? shown).title}</span>
        </span>
      </div>
      {finals.length > 1 && (
        <ol className="reel-landed-list">
          {finals.map((f, i) => (
            <li key={f.key} className={i < landed.length ? 'on' : ''}>
              {i < landed.length ? (
                <>
                  <CupGlyph id={f.cupId} size={22} /> {f.title}
                </>
              ) : (
                '…'
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Cup row for a heat: shows the pick and the right button for the track mode. */
export function HeatCup({ tour, heat, compact }: { tour: Tournament; heat: Heat; compact?: boolean }) {
  const t = useT();
  const dispatch = useApp((s) => s.dispatch);
  const [spin, setSpin] = useState<CupPick | null>(null);
  const [picking, setPicking] = useState(false);
  const mode = tour.settings.trackMode;
  const played = !!heat.result;

  const startSpin = () => {
    const pick = randomCupFor(tour, Math.floor(Math.random() * 2 ** 31));
    if (pick) setSpin(pick);
  };
  const commit = (pick: CupPick) => dispatch({ type: 'setCup', heatId: heat.id, cup: pick });
  if (!heat.cup && (played || (mode === 'none' && compact))) return null;

  return (
    <div className="heat-cup">
      {heat.cup ? <CupInfo pick={heat.cup} compact={compact} /> : mode === 'none' ? <span className="muted">{t('heat.noCup')}</span> : null}
      {!played && mode !== 'none' && (
        <button className={`btn ${compact ? 'btn-sm' : 'btn-lg'} ${heat.cup ? 'btn-white' : 'btn-gold'}`} onClick={() => (mode === 'pick' ? setPicking(true) : startSpin())} data-testid="spin-cup">
          {mode !== 'pick' && <IconShuffle size={18} />}
          {mode === 'pick' ? t('heat.pickCup') : heat.cup ? t('heat.respin') : mode === 'random-tracks' ? t('heat.spinTracks') : t('heat.spin')}
        </button>
      )}
      {spin && (
        <Modal
          title={mode === 'random-tracks' ? t('heat.spinTracks') : t('heat.spin')}
          onClose={() => {
            commit(spin);
            setSpin(null);
          }}
        >
          <Roulette
            pick={spin}
            boosterPass={tour.settings.boosterPass}
            onDone={() => {
              commit(spin);
              setSpin(null);
            }}
          />
        </Modal>
      )}
      {picking && (
        <Modal title={t('heat.pickCup')} onClose={() => setPicking(false)} wide>
          <div className="cup-grid">
            {cupPool(CUPS, tour.settings.boosterPass).map((c) => (
              <button
                key={c.id}
                className={`cup-choice ${heat.cup?.kind === 'cup' && heat.cup.cupId === c.id ? 'on' : ''}`}
                onClick={() => {
                  commit({ kind: 'cup', cupId: c.id });
                  sound.success();
                  setPicking(false);
                }}
              >
                <CupEmblem cup={c} size={44} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
