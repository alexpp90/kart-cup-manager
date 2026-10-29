import { avatarEmoji } from '../data/avatars';
import type { Player } from '../engine/types';

interface Props {
  player?: Pick<Player, 'avatar' | 'color' | 'name'>;
  avatar?: string;
  color?: string;
  size?: number;
  className?: string;
}

/** Racing-helmet badge in the player's color with an emoji driver in the visor. */
export function Avatar({ player, avatar, color, size = 40, className = '' }: Props) {
  const a = avatar ?? player?.avatar ?? 'fox';
  const c = color ?? player?.color ?? '#E60012';
  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, ['--c' as string]: c }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <circle cx="32" cy="32" r="29" fill={c} stroke="#14213D" strokeWidth="3.5" />
        <path d="M10 26a23 23 0 0 1 44 0" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" />
        <rect x="9" y="27" width="46" height="9" fill="#fff" fillOpacity=".25" />
        <circle cx="32" cy="36" r="17" fill="#fff" stroke="#14213D" strokeWidth="3" />
      </svg>
      <span className="avatar-emoji" style={{ fontSize: size * 0.42 }}>
        {avatarEmoji(a)}
      </span>
    </span>
  );
}
