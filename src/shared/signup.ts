// Checks for a sign-up that comes from a phone or the sign-up station. Used by
// the server (everything a guest sends is treated as hostile) and again by the
// organizer's app before a sign-up becomes a player.
import { COLORS } from '../data/colors';

export const NAME_MAX = 24;
export const TAG_MAX = 8;
export const MAX_PLAYERS = 64;
/** Join codes: no 0/O, 1/I/L, so they read and type unambiguously. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export interface SignUpInput {
  name: string;
  tag: string;
  color: string;
}

export type SignUpError = 'bad-request' | 'name-required' | 'name-too-long' | 'tag-too-long' | 'bad-color';

/** Count user-perceived characters (grapheme clusters), so emoji count as one. */
export function graphemes(s: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  if (!Seg) return Array.from(s).length;
  let n = 0;
  for (const _ of new Seg(undefined, { granularity: 'grapheme' }).segment(s)) n++;
  return n;
}

/** Remove control characters and bidi overrides/isolates, collapse whitespace. */
export function cleanText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCode(s: unknown): s is string {
  return typeof s === 'string' && s.length === CODE_LENGTH && [...s].every((c) => CODE_ALPHABET.includes(c));
}

export type CheckedSignUp = { ok: true; value: SignUpInput } | { ok: false; error: SignUpError };

export function checkSignUp(raw: unknown): CheckedSignUp {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'bad-request' };
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || (r.tag !== undefined && typeof r.tag !== 'string') || (r.color !== undefined && typeof r.color !== 'string')) return { ok: false, error: 'bad-request' };
  if (r.name.length > 200 || (typeof r.tag === 'string' && r.tag.length > 100)) return { ok: false, error: 'name-too-long' };
  const name = cleanText(r.name);
  const tag = cleanText(typeof r.tag === 'string' ? r.tag : '');
  if (!name) return { ok: false, error: 'name-required' };
  if (graphemes(name) > NAME_MAX) return { ok: false, error: 'name-too-long' };
  if (graphemes(tag) > TAG_MAX) return { ok: false, error: 'tag-too-long' };
  const color = typeof r.color === 'string' && r.color ? COLORS.find((c) => c.toLowerCase() === (r.color as string).toLowerCase()) : COLORS[0];
  if (!color) return { ok: false, error: 'bad-color' };
  return { ok: true, value: { name, tag, color } };
}

/** Same comparison as the app's "name taken": case-insensitive, spaces collapsed. */
export const nameKey = (name: string) => cleanText(name).toLocaleLowerCase();
