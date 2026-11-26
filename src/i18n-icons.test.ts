/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.dirname(new URL(import.meta.url).pathname);
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}
// Emoji need a colour-emoji font; many screens (the Raspberry Pi) show boxes instead.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{2460}-\u{24FF}\u{FE0F}]/u;
// Plain symbols that ordinary fonts (DejaVu, the phones' fonts) have.
const ALLOWED = new Set(['✓']);

describe('[REQ-UI-034] icons without an emoji font', () => {
  it('[REQ-UI-034] the app\'s screens and texts contain no emoji: icons are drawn as SVG', () => {
    const found: string[] = [];
    for (const f of files(root)) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\*|\/\*\*)/.test(line)) return;
          for (const ch of line) if (EMOJI.test(ch) && !ALLOWED.has(ch)) found.push(`${path.relative(root, f)}:${i + 1} ${ch}`);
        });
    }
    expect(found).toEqual([]);
  });
});
