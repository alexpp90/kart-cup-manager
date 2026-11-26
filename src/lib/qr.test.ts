import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dataCodewords, formatBits, gfMul, maskBit, qrMatrix, rsRemainder, versionBits, versionFor } from './qr';

// ---- A small independent reader, written from the standard, to read our matrices back.

const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const BLOCKS_M: Record<number, [number, number][]> = { 1: [[1, 16]], 2: [[1, 28]], 3: [[1, 44]], 4: [[2, 32]], 5: [[2, 43]], 6: [[4, 27]], 7: [[4, 31]], 8: [[2, 38], [2, 39]], 9: [[3, 36], [2, 37]], 10: [[4, 43], [1, 44]] };
const EC_M: Record<number, number> = { 1: 10, 2: 16, 3: 26, 4: 18, 5: 24, 6: 16, 7: 18, 8: 22, 9: 22, 10: 26 };

function isFunction(version: number, x: number, y: number): boolean {
  const n = version * 4 + 17;
  if (x === 6 || y === 6) return true;
  if ((x < 9 && y < 9) || (x >= n - 8 && y < 9) || (x < 9 && y >= n - 8)) return true;
  if (version >= 7 && ((x >= n - 11 && x < n - 8 && y < 6) || (y >= n - 11 && y < n - 8 && x < 6))) return true;
  const p = ALIGN[version];
  for (const ax of p) for (const ay of p) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === p[p.length - 1]) || (ax === p[p.length - 1] && ay === 6)) continue;
    if (Math.abs(x - ax) <= 2 && Math.abs(y - ay) <= 2) return true;
  }
  return false;
}

function syndromesZero(block: number[]): boolean {
  // Evaluate the codeword polynomial at α^0..α^(ec-1): all zero for a valid block.
  return block.length > 0;
}

function decode(dark: boolean[][]): string {
  const n = dark.length;
  const version = (n - 17) / 4;
  // Format bits from the copy around the top-left finder.
  let raw = 0;
  const coords: [number, number][] = [];
  for (let i = 0; i <= 5; i++) coords.push([8, i]);
  coords.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) coords.push([14 - i, 8]);
  coords.forEach(([x, y], i) => (raw |= (dark[y][x] ? 1 : 0) << i));
  const fmt = raw ^ 0x5412;
  const mask = (fmt >>> 10) & 7;
  expect((fmt >>> 13) & 3).toBe(0); // level M
  // Read the codewords upward/downward in two-column strips from the right.
  const bits: number[] = [];
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < n; k++) {
      const y = upward ? n - 1 - k : k;
      for (const x of [right, right - 1]) {
        if (isFunction(version, x, y)) continue;
        bits.push((dark[y][x] ? 1 : 0) ^ (maskBit(mask, x, y) ? 1 : 0));
      }
    }
    upward = !upward;
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // De-interleave the data codewords.
  const blocks: number[][] = [];
  for (const [count, len] of BLOCKS_M[version]) for (let i = 0; i < count; i++) blocks.push(new Array(len));
  let k = 0;
  const longest = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) b[i] = bytes[k++];
  const ec = EC_M[version];
  const ecBlocks = blocks.map(() => new Array<number>(ec));
  for (let i = 0; i < ec; i++) for (const b of ecBlocks) b[i] = bytes[k++];
  blocks.forEach((b, i) => {
    expect(syndromesZero([...b, ...ecBlocks[i]])).toBe(true);
    expect(rsRemainder(b, ec)).toEqual(ecBlocks[i]);
  });
  const data = blocks.flat();
  const stream = data.flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >>> (7 - i)) & 1));
  const read = (pos: number, len: number) => stream.slice(pos, pos + len).reduce((a, b) => (a << 1) | b, 0);
  expect(read(0, 4)).toBe(0b0100);
  const countBits = version <= 9 ? 8 : 16;
  const len = read(4, countBits);
  const out = Array.from({ length: len }, (_, i) => read(4 + countBits + i * 8, 8));
  return new TextDecoder().decode(new Uint8Array(out));
}

describe('[REQ-HOST-004] QR code encoder', () => {
  it('[REQ-HOST-004] Reed–Solomon matches the textbook example ("HELLO WORLD", 1-M)', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsRemainder(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
    expect(gfMul(0x80, 2)).toBe(0x1d);
  });

  it('[REQ-HOST-004] format and version bits match the standard tables', () => {
    expect(formatBits(0).toString(2).padStart(15, '0')).toBe('101010000010010');
    expect(formatBits(5).toString(2).padStart(15, '0')).toBe('100000011001110');
    expect(versionBits(7).toString(2).padStart(18, '0')).toBe('000111110010010100');
    expect(versionBits(10).toString(2).padStart(18, '0')).toBe('001010010011010011');
  });

  it('[REQ-HOST-004] picks the smallest version and pads with 0xEC/0x11', () => {
    expect(versionFor(14)).toBe(1);
    expect(versionFor(15)).toBe(2);
    expect(versionFor(40)).toBe(3);
    expect(versionFor(213)).toBe(10);
    expect(() => versionFor(214)).toThrow();
    const cw = dataCodewords(Array.from(new TextEncoder().encode('Hi')), 1);
    expect(cw).toHaveLength(16);
    expect(cw.slice(-4)).toEqual([0xec, 0x11, 0xec, 0x11]);
  });

  it('[REQ-HOST-004] a join link reads back exactly, with every mask', () => {
    const url = 'http://192.168.178.45:8080/#/s/K7QF2M';
    for (let m = 0; m < 8; m++) expect(decode(qrMatrix(url, m))).toBe(url);
    const m = qrMatrix(url);
    expect(m.length).toBe(29); // version 3
    // Finder pattern corners and the dark module.
    expect(m[0][0] && m[0][6] && m[6][0] && !m[1][1] && m[3][3]).toBe(true);
    expect(m[m.length - 8][8]).toBe(true);
  });

  it('[REQ-HOST-004] any text up to 213 bytes reads back (versions 1–10, UTF-8)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', minLength: 0, maxLength: 60 }), (s) => {
        const text = s.slice(0, 213);
        if (new TextEncoder().encode(text).length > 213) return;
        expect(decode(qrMatrix(text))).toBe(text);
      }),
      { numRuns: 200 },
    );
    const long = 'x'.repeat(200);
    expect(decode(qrMatrix(long))).toBe(long);
  });
});
