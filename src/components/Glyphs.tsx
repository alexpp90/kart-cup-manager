// Small icons drawn from scratch as SVG. They replace emoji, which need a
// colour-emoji font that many screens don't have (the Raspberry Pi showed
// empty boxes). Every shape here is original and generic.
import type { ReactElement, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, p: P) => ({ width: size, height: size, 'aria-hidden': true as const, focusable: false as const, ...p });
const S = { stroke: '#14213D', strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

export type GlyphName = 'trophy' | 'flag' | 'swords' | 'chart' | 'numbers' | 'tap' | 'phone' | 'zoom' | 'keyboard' | 'party' | 'disk' | 'clover';

/** Interface icons (choice cards, buttons, chips). */
export function Glyph({ name, size = 22, ...p }: P & { name: GlyphName }) {
  return (
    <svg viewBox="0 0 32 32" className="glyph" {...base(size, p)}>
      {GLYPHS[name]}
    </svg>
  );
}

const GLYPHS: Record<GlyphName, ReactElement> = {
  trophy: (
    <g {...S}>
      <path d="M9 5h14v6a7 7 0 0 1-14 0z" fill="#FFC81E" />
      <path d="M9 7H5a4 4 0 0 0 5 6M23 7h4a4 4 0 0 1-5 6" fill="none" />
      <path d="M16 18v5M11 27h10l-1-4h-8z" fill="#FFC81E" />
    </g>
  ),
  flag: (
    <g {...S}>
      <path d="M7 29V4" fill="none" strokeWidth={2.5} />
      <path d="M7 5h19v13H7z" fill="#fff" />
      <path d="M7 5h5v4H7zM17 5h4v4h-4zM12 9h5v5h-5zM21 9h5v5h-5zM7 14h5v4H7zM17 14h4v4h-4z" fill="#14213D" stroke="none" />
    </g>
  ),
  swords: (
    <g {...S}>
      <path d="M6 6l14 14M26 6L12 20" fill="none" strokeWidth={3} />
      <path d="M18 22l4-4M14 22l-4-4M21 21l5 5M11 21l-5 5" fill="none" strokeWidth={2.5} />
    </g>
  ),
  chart: (
    <g {...S}>
      <path d="M5 27h22" fill="none" />
      <rect x="7" y="16" width="5" height="11" fill="#3BA7F5" />
      <rect x="14" y="9" width="5" height="18" fill="#E60012" />
      <rect x="21" y="13" width="5" height="14" fill="#FFC81E" />
    </g>
  ),
  numbers: (
    <g {...S}>
      <rect x="3" y="7" width="26" height="18" rx="4" fill="#fff" />
      <path d="M8 13l2-1.5V20M14 13.5a2 2 0 1 1 3 1.7L14 20h4M21.5 12.5h3l-2 3a2.4 2.4 0 1 1-2 3.6" fill="none" strokeWidth={1.8} />
    </g>
  ),
  tap: (
    <g {...S}>
      <circle cx="16" cy="10" r="6" fill="none" strokeDasharray="3 3" />
      <path d="M14 10v11l-3-2a2 2 0 0 0-2 3l5 6h9l2-8v-4a2 2 0 0 0-4 0v-1a2 2 0 0 0-4 0V10a2 2 0 0 0-4 0z" fill="#fff" />
    </g>
  ),
  phone: (
    <g {...S}>
      <rect x="9" y="3" width="14" height="26" rx="3" fill="#fff" />
      <path d="M14 6h4M15 25h2" fill="none" />
    </g>
  ),
  zoom: (
    <g {...S}>
      <circle cx="13" cy="13" r="8" fill="#fff" strokeWidth={2.5} />
      <path d="M19 19l8 8" fill="none" strokeWidth={3.5} />
      <path d="M13 9v8M9 13h8" fill="none" />
    </g>
  ),
  keyboard: (
    <g {...S}>
      <rect x="2" y="8" width="28" height="16" rx="3" fill="#fff" />
      <path d="M6 12h2M11 12h2M16 12h2M21 12h2M26 12h0M6 16h2M11 16h2M16 16h2M21 16h2M9 20h14" fill="none" />
    </g>
  ),
  party: (
    <g {...S}>
      <path d="M5 28l6-17 10 10z" fill="#FFC81E" />
      <path d="M15 8l2-4M21 10l5-2M22 15l5 1" fill="none" stroke="#E60012" />
      <circle cx="25" cy="4" r="1.5" fill="#3BA7F5" stroke="none" />
      <circle cx="28" cy="21" r="1.5" fill="#4CC85A" stroke="none" />
    </g>
  ),
  disk: (
    <g {...S}>
      <path d="M5 5h17l5 5v17H5z" fill="#3BA7F5" />
      <path d="M10 5v7h11V5" fill="#fff" />
      <rect x="9" y="17" width="14" height="10" fill="#fff" />
    </g>
  ),
  clover: (
    <g {...S}>
      <g fill="#2DB84B">
        <path d="M16 15c-1.5-4.5-7.5-6-8.5-2s3.5 5 8.5 2Z" />
        <path d="M16 15c4.5-1.5 6-7.5 2-8.5s-5 3.5-2 8.5Z" />
        <path d="M16 15c1.5 4.5 7.5 6 8.5 2s-3.5-5-8.5-2Z" />
        <path d="M16 15c-4.5 1.5-6 7.5-2 8.5s5-3.5 2-8.5Z" />
      </g>
      <path d="M16 15c2 4 3 8 2 13" fill="none" />
    </g>
  ),
};

/** The emblem symbol of a cup: a simple white shape, drawn on the cup's shield. */
export function CupGlyph({ id, size = 24 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" className="cup-glyph-svg" {...base(size, {})}>
      <g fill="#fff" {...S}>
        {CUP_GLYPHS[id] ?? CUP_GLYPHS.star}
      </g>
    </svg>
  );
}

const petals = (n: number, r: number, pr: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return <circle key={i} cx={16 + Math.cos(a) * r} cy={16 + Math.sin(a) * r} r={pr} />;
  });

const CUP_GLYPHS: Record<string, ReactElement> = {
  mushroom: (
    <>
      <path d="M4 17a12 11 0 0 1 24 0z" />
      <path d="M12 17h8v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
      <circle cx="11" cy="11" r="2" fill="#14213D" stroke="none" />
      <circle cx="20" cy="10" r="2.5" fill="#14213D" stroke="none" />
    </>
  ),
  flower: (
    <>
      {petals(5, 7, 5)}
      <circle cx="16" cy="16" r="4" fill="#FFC81E" />
    </>
  ),
  star: <path d="M16 3l3.9 8 8.6 1.1-6.3 6 1.6 8.6L16 22.6l-7.8 4.1 1.6-8.6-6.3-6 8.6-1.1z" />,
  special: <path d="M5 24l-2-14 7 6 6-10 6 10 7-6-2 14z" />,
  shell: (
    <>
      <path d="M16 27L4 14a12 12 0 0 1 24 0z" />
      <path d="M16 27V8M16 27l-6-17M16 27l6-17" fill="none" />
    </>
  ),
  banana: <path d="M7 7c-2 9 2 18 14 19 3 0 5-1 6-2-9-1-14-7-16-17z" />,
  leaf: (
    <>
      <path d="M5 27C5 12 14 5 28 4c-1 14-8 23-23 23z" />
      <path d="M6 26L21 11" fill="none" />
    </>
  ),
  lightning: <path d="M19 3L7 18h8l-3 11 13-16h-8z" />,
  egg: (
    <>
      <ellipse cx="16" cy="17" rx="9" ry="12" />
      <circle cx="13" cy="13" r="2" fill="#14213D" stroke="none" />
      <circle cx="19" cy="20" r="2.5" fill="#14213D" stroke="none" />
    </>
  ),
  triforce: <path d="M16 5l12 22H4z" />,
  crossing: (
    <>
      <path d="M14 20h4v8h-4z" />
      <circle cx="16" cy="13" r="9" />
    </>
  ),
  bell: (
    <>
      <path d="M8 22c2-2 2-6 2-9a6 6 0 0 1 12 0c0 3 0 7 2 9z" />
      <circle cx="16" cy="25" r="2.5" />
    </>
  ),
  'golden-dash': (
    <>
      <path d="M8 28V4" fill="none" />
      <path d="M8 5h17v12H8z" />
      <path d="M8 5h4v4H8zM16 5h5v4h-5zM12 9h4v4h-4zM21 9h4v4h-4zM8 13h4v4H8zM16 13h5v4h-5z" fill="#14213D" stroke="none" />
    </>
  ),
  'lucky-cat': (
    <>
      <path d="M6 13l1-9 6 5h6l6-5 1 9c2 8-3 14-10 14S4 21 6 13z" />
      <circle cx="12" cy="16" r="1.5" fill="#14213D" stroke="none" />
      <circle cx="20" cy="16" r="1.5" fill="#14213D" stroke="none" />
    </>
  ),
  turnip: (
    <>
      <path d="M16 12c6 0 9 4 9 8s-4 7-9 9c-5-2-9-5-9-9s3-8 9-8z" />
      <path d="M16 12c-1-4-5-7-8-7 0 3 3 6 8 7zM16 12c1-4 5-7 8-7 0 3-3 6-8 7z" />
    </>
  ),
  propeller: (
    <>
      <path d="M16 16c-2-6-1-11 2-12s4 5-2 12zM16 16c6-2 11 0 11 3s-6 3-11-3zM16 16c-4 5-9 7-11 5s3-6 11-5z" />
      <circle cx="16" cy="16" r="2.5" />
    </>
  ),
  rock: <path d="M4 25l4-11 6-6 8 2 6 9-2 6z" />,
  moon: <path d="M20 4a12 12 0 1 0 8 19A10 10 0 0 1 20 4z" />,
  fruit: (
    <>
      <path d="M11 20c2-8 5-13 11-15M21 21c0-7 1-12 1-16" fill="none" />
      <circle cx="10" cy="22" r="5" />
      <circle cx="21" cy="23" r="5" />
    </>
  ),
  boomerang: <path d="M5 8c5-3 9-2 11 2l3 6 8 6c-4 3-8 3-11-1L8 12C6 11 5 10 5 8z" />,
  feather: (
    <>
      <path d="M7 27c0-12 6-21 20-23-2 13-9 21-20 23z" />
      <path d="M7 27L22 9" fill="none" />
    </>
  ),
  cherry: (
    <>
      {petals(5, 7.5, 5.5)}
      <circle cx="16" cy="16" r="3" fill="#FFC81E" />
    </>
  ),
  acorn: (
    <>
      <path d="M8 13c0 8 3 13 8 15 5-2 8-7 8-15z" />
      <path d="M6 13a10 7 0 0 1 20 0z" />
      <path d="M16 6V3" fill="none" />
    </>
  ),
  spiny: (
    <>
      <path d="M3 24l3-6-1-5 5 1 2-6 4 4 4-4 2 6 5-1-1 5 3 6z" />
      <circle cx="9" cy="21" r="1.4" fill="#14213D" stroke="none" />
    </>
  ),
};
