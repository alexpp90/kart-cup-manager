// Every graphic here is drawn from scratch in SVG (no official artwork).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 24, p: P) => ({ width: size, height: size, 'aria-hidden': true as const, focusable: false as const, ...p });

export function ItemBox({ size = 40, ...p }: P) {
  return (
    <svg viewBox="0 0 48 48" {...base(size, p)}>
      <defs>
        <linearGradient id="ib" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE680" />
          <stop offset=".5" stopColor="#FFC81E" />
          <stop offset="1" stopColor="#FF9F1C" />
        </linearGradient>
      </defs>
      <rect x="5" y="5" width="38" height="38" rx="9" fill="url(#ib)" stroke="#14213D" strokeWidth="3" transform="rotate(-6 24 24)" />
      <path d="M18 18.5c0-3.6 2.8-6 6.4-6 3.5 0 6.2 2.2 6.2 5.4 0 2.6-1.6 3.9-3.5 5-1.4.8-1.9 1.4-1.9 2.8v.8h-4.3v-1.2c0-2.3.9-3.6 2.8-4.7 1.5-.9 2.3-1.4 2.3-2.6 0-1.1-.9-1.9-2-1.9-1.3 0-2.2.9-2.2 2.4H18Zm3.4 13.1a2.7 2.7 0 1 1 5.4 0 2.7 2.7 0 0 1-5.4 0Z" fill="#fff" stroke="#14213D" strokeWidth="1.6" transform="rotate(-6 24 24)" />
    </svg>
  );
}

export function Coin({ size = 24, ...p }: P) {
  return (
    <svg viewBox="0 0 32 32" {...base(size, p)}>
      <ellipse cx="16" cy="16" rx="12" ry="14" fill="#FFC81E" stroke="#14213D" strokeWidth="2.5" />
      <ellipse cx="16" cy="16" rx="7" ry="9" fill="none" stroke="#E09B00" strokeWidth="2" />
      <rect x="14" y="9.5" width="4" height="13" rx="2" fill="#FFF3C4" />
    </svg>
  );
}

export function Star({ size = 24, ...p }: P) {
  return (
    <svg viewBox="0 0 32 32" {...base(size, p)}>
      <path d="M16 2.8l3.9 8.3 9 1.1-6.6 6.2 1.7 9-8-4.5-8 4.5 1.7-9-6.6-6.2 9-1.1z" fill="#FFC81E" stroke="#14213D" strokeWidth="2.4" strokeLinejoin="round" />
      <ellipse cx="13.2" cy="15.5" rx="1.3" ry="2.2" fill="#14213D" />
      <ellipse cx="18.8" cy="15.5" rx="1.3" ry="2.2" fill="#14213D" />
    </svg>
  );
}

export function Flag({ size = 24, ...p }: P) {
  return (
    <svg viewBox="0 0 32 32" {...base(size, p)}>
      <rect x="5" y="3" width="2.6" height="27" rx="1.3" fill="#14213D" />
      <path d="M7.5 4h19l-3 6 3 6h-19z" fill="#fff" stroke="#14213D" strokeWidth="2" strokeLinejoin="round" />
      <path d="M7.5 4h4.75v4h-4.75zM17 4h4.75v4H17zM12.25 8H17v4h-4.75zM21.75 8h3.8l-1.8 4h-2zM7.5 12h4.75v4H7.5zM17 12h4.75v4H17z" fill="#14213D" />
    </svg>
  );
}

export function Trophy({ size = 24, ...p }: P) {
  return (
    <svg viewBox="0 0 48 48" {...base(size, p)}>
      <path d="M12 9h24v8c0 7-5.4 12.5-12 12.5S12 24 12 17z" fill="#FFC81E" stroke="#14213D" strokeWidth="3" strokeLinejoin="round" />
      <path d="M12 12H6.5c0 6 2.7 9 7 9.5M36 12h5.5c0 6-2.7 9-7 9.5" fill="none" stroke="#14213D" strokeWidth="3" strokeLinecap="round" />
      <rect x="20.5" y="29" width="7" height="6" fill="#FFC81E" stroke="#14213D" strokeWidth="3" />
      <rect x="14" y="35" width="20" height="7" rx="2" fill="#E60012" stroke="#14213D" strokeWidth="3" />
      <path d="M17 13v4.5c0 3 1.5 5.5 4 6.8" fill="none" stroke="#FFF3C4" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Helmet({ color = '#E60012', size = 40, ...p }: P & { color?: string }) {
  return (
    <svg viewBox="0 0 64 64" {...base(size, p)}>
      <path d="M8 38C8 21 19 9 34 9c13 0 22 9 22 22v8c0 4-3 7-7 7H15c-4 0-7-3-7-8z" fill={color} stroke="#14213D" strokeWidth="3.5" />
      <path d="M30 10c-8 2-14 9-16 18" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="4" strokeLinecap="round" />
      <rect x="26" y="24" width="28" height="15" rx="7.5" fill="#BDE8FF" stroke="#14213D" strokeWidth="3.5" />
    </svg>
  );
}

const ui = (d: string) =>
  function UiIcon({ size = 22, ...p }: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...base(size, p)}>
        <path d={d} />
      </svg>
    );
  };

export const IconHome = ui('M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z');
export const IconUsers = ui('M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6');
export const IconGrid = ui('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z');
export const IconList = ui('M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01');
export const IconBracket = ui('M3 5h5v6H3M3 13h5v6H3M8 8h4v8H8M12 12h5M17 9h4v6h-4z');
export const IconGear = ui('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z');
export const IconUndo = ui('M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11');
export const IconTv = ui('M3 5h18v12H3zM8 21h8M12 17v4');
export const IconTablet = ui('M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2');
export const IconSoundOn = ui('M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14');
export const IconSoundOff = ui('M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6');
export const IconUp = ui('M18 15l-6-6-6 6');
export const IconDown = ui('M6 9l6 6 6-6');
export const IconPlus = ui('M12 5v14M5 12h14');
export const IconX = ui('M18 6L6 18M6 6l12 12');
export const IconCheck = ui('M20 6L9 17l-5-5');
export const IconEdit = ui('M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z');
export const IconDownload = ui('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3');
export const IconUpload = ui('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12');
export const IconShuffle = ui('M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5');
export const IconInfo = ui('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01');
export const IconPodium = ui('M8 21V11h8v10M2 21v-6h6M16 21v-8h6v8M1 21h22M12 3l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 9l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z');
export const IconMove = ui('M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20');

/** Four-leaf clover: the "lucky loser" mark for fill-ups. */
export function Clover({ size = 18, ...p }: P) {
  return (
    <svg viewBox="0 0 32 32" {...base(size, p)}>
      <g fill="#2DB84B" stroke="#14213D" strokeWidth="2">
        <path d="M16 15c-1.5-4.5-7.5-6-8.5-2s3.5 5 8.5 2Z" />
        <path d="M16 15c4.5-1.5 6-7.5 2-8.5s-5 3.5-2 8.5Z" />
        <path d="M16 15c1.5 4.5 7.5 6 8.5 2s-3.5-5-8.5-2Z" />
        <path d="M16 15c-4.5 1.5-6 7.5-2 8.5s5-3.5 2-8.5Z" />
      </g>
      <path d="M16 15c2 4 3 8 2 13" fill="none" stroke="#14213D" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
