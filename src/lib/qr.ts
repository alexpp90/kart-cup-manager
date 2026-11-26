// A small QR code encoder written from the ISO/IEC 18004 rules: byte mode,
// error correction level M, versions 1–10 (up to 213 bytes, plenty for a join
// link). No dependency and no network: the code is drawn locally as SVG.

const EC_M: Record<number, { ec: number; blocks: [number, number][] }> = {
  // version: EC codewords per block, [count, data codewords per block]
  1: { ec: 10, blocks: [[1, 16]] },
  2: { ec: 16, blocks: [[1, 28]] },
  3: { ec: 26, blocks: [[1, 44]] },
  4: { ec: 18, blocks: [[2, 32]] },
  5: { ec: 24, blocks: [[2, 43]] },
  6: { ec: 16, blocks: [[4, 27]] },
  7: { ec: 18, blocks: [[4, 31]] },
  8: { ec: 22, blocks: [[2, 38], [2, 39]] },
  9: { ec: 22, blocks: [[3, 36], [2, 37]] },
  10: { ec: 26, blocks: [[4, 43], [1, 44]] },
};
const ALIGN: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};
const LEVEL_M_BITS = 0; // format bits of level M

// ---------------------------------------------------------------- GF(256) and Reed–Solomon

export function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

/** Error correction codewords for one block. */
export function rsRemainder(data: number[], degree: number): number[] {
  const divisor = rsDivisor(degree);
  const result = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

// ---------------------------------------------------------------- BCH codes

/** 15 format bits for level M and a mask (already XORed with 0x5412). */
export function formatBits(mask: number): number {
  const data = (LEVEL_M_BITS << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 version bits (versions 7 and up). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

// ---------------------------------------------------------------- encoding

const dataCapacity = (v: number) => EC_M[v].blocks.reduce((a, [n, d]) => a + n * d, 0);

/** Smallest version whose byte-mode capacity fits `bytes`. */
export function versionFor(bytes: number): number {
  for (let v = 1; v <= 10; v++) {
    const countBits = v <= 9 ? 8 : 16;
    if (4 + countBits + bytes * 8 <= dataCapacity(v) * 8) return v;
  }
  throw new Error('QR: text too long');
}

/** Data codewords: mode, length, bytes, terminator, padding. */
export function dataCodewords(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const put = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  const cap = dataCapacity(version) * 8;
  put(0b0100, 4);
  put(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < cap / 8; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Split into blocks, add error correction, interleave. */
export function interleave(data: number[], version: number): number[] {
  const { ec, blocks } = EC_M[version];
  const dataBlocks: number[][] = [];
  let k = 0;
  for (const [count, len] of blocks) {
    for (let i = 0; i < count; i++) {
      dataBlocks.push(data.slice(k, k + len));
      k += len;
    }
  }
  const ecBlocks = dataBlocks.map((b) => rsRemainder(b, ec));
  const out: number[] = [];
  const longest = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < longest; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

// ---------------------------------------------------------------- matrix

type Grid = { size: number; dark: boolean[][]; fn: boolean[][] };

function newGrid(version: number): Grid {
  const size = version * 4 + 17;
  return { size, dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)), fn: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)) };
}

/** Set a function module at column x, row y. */
function setFn(g: Grid, x: number, y: number, dark: boolean) {
  g.dark[y][x] = dark;
  g.fn[y][x] = true;
}

function drawFunctionPatterns(g: Grid, version: number) {
  const n = g.size;
  for (let i = 0; i < n; i++) {
    setFn(g, 6, i, i % 2 === 0);
    setFn(g, i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(g, x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(n - 4, 3);
  finder(3, n - 4);
  const pos = ALIGN[version];
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(g, pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  drawFormat(g, 0); // reserve; redrawn with the chosen mask
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFn(g, a, b, dark);
      setFn(g, b, a, dark);
    }
  }
}

function drawFormat(g: Grid, mask: number) {
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const n = g.size;
  for (let i = 0; i <= 5; i++) setFn(g, 8, i, bit(i));
  setFn(g, 8, 7, bit(6));
  setFn(g, 8, 8, bit(7));
  setFn(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(g, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setFn(g, n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(g, 8, n - 15 + i, bit(i));
  setFn(g, 8, n - 8, true); // the dark module
}

function drawCodewords(g: Grid, codewords: number[]) {
  const n = g.size;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (!g.fn[y][x] && i < codewords.length * 8) {
          g.dark[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

export function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(g: Grid, mask: number) {
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.fn[y][x] && maskBit(mask, x, y)) g.dark[y][x] = !g.dark[y][x];
}

/** Penalty score of the four masking rules. */
export function penalty(dark: boolean[][]): number {
  const n = dark.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    for (let i = 0; i + 11 <= n; i++) {
      const s = Array.from({ length: 11 }, (_, k) => (get(i + k) ? '1' : '0')).join('');
      if (s === '10111010000' || s === '00001011101') score += 40;
    }
  };
  for (let y = 0; y < n; y++) line((i) => dark[y][i]);
  for (let x = 0; x < n; x++) line((i) => dark[i][x]);
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) if (dark[y][x] === dark[y][x + 1] && dark[y][x] === dark[y + 1][x] && dark[y][x] === dark[y + 1][x + 1]) score += 3;
  const total = dark.reduce((a, row) => a + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((total * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

/** The QR matrix for `text` (UTF-8, level M), dark = true. `mask` forces a mask (tests). */
export function qrMatrix(text: string, mask?: number): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = versionFor(bytes.length);
  const codewords = interleave(dataCodewords(bytes, version), version);
  let best: { dark: boolean[][]; score: number } | null = null;
  for (let m = 0; m < 8; m++) {
    if (mask !== undefined && m !== mask) continue;
    const g = newGrid(version);
    drawFunctionPatterns(g, version);
    drawCodewords(g, codewords);
    applyMask(g, m);
    drawFormat(g, m);
    const score = penalty(g.dark);
    if (!best || score < best.score) best = { dark: g.dark, score };
  }
  return best!.dark;
}

/** One SVG path for all dark modules, with a 4-module quiet zone. */
export function qrSvgPath(dark: boolean[][]): { path: string; size: number } {
  const parts: string[] = [];
  dark.forEach((row, y) => row.forEach((d, x) => d && parts.push(`M${x + 4} ${y + 4}h1v1h-1z`)));
  return { path: parts.join(''), size: dark.length + 8 };
}
