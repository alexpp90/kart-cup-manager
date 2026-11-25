/// <reference types="node" />
// Static checks over the source tree: every UI string comes from the dictionaries,
// both languages are complete, the engine stays free of React, TypeScript is strict.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dictionaries, translate } from './i18n';

const root = path.resolve(__dirname, '..');
function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) files(p, ext, out);
    else if (ext.test(f) && !/\.test\.ts$/.test(f)) out.push(p);
  }
  return out;
}
const source = files(path.join(root, 'src'), /\.(ts|tsx)$/).map((f) => ({ f: path.relative(root, f), text: readFileSync(f, 'utf8') }));
const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe('i18n', () => {
  it('[REQ-I18N-001] every literal translation key used in the source exists; JSX has no hard-coded words; English is the default', () => {
    const keys = new Set(Object.keys(dictionaries.en));
    const missing: string[] = [];
    let used = 0;
    for (const { f, text } of source) {
      for (const m of text.matchAll(/\b(?:t|tNow|tr|translate\([^,]+,)\s*\(?\s*'([a-z][\w.]*)'/g)) {
        used++;
        if (!keys.has(m[1])) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
    expect(used).toBeGreaterThan(200);
    const hardCoded: string[] = [];
    for (const { f, text } of source.filter((s) => s.f.endsWith('.tsx'))) {
      for (const m of text.matchAll(/>\s*([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß ,.!?'-]{2,})\s*</g)) {
        // The product name in the logo is not translated.
        if (!/^(Kart Cup|Manager)$/.test(m[1].trim())) hardCoded.push(`${f}: ${m[1]}`);
      }
    }
    expect(hardCoded).toEqual([]);
    const store = readFileSync(path.join(root, 'src/store/store.ts'), 'utf8');
    expect(store).toMatch(/return \{ lang: 'en', sound: false \}/);
  });

  it('[REQ-I18N-002] German is complete: same keys, same placeholders, no empty strings', () => {
    const en = dictionaries.en as Record<string, string>;
    const de = dictionaries.de as Record<string, string>;
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) {
      expect(placeholders(de[k]), k).toEqual(placeholders(en[k]));
      expect(de[k].trim(), k).not.toBe('');
      expect(en[k].trim(), k).not.toBe('');
    }
    expect(translate('de', 'nav.home')).not.toBe(translate('en', 'nav.home'));
  });
});

describe('build rules', () => {
  it('[REQ-BLD-003] TypeScript is strict and the engine imports no React', () => {
    const ts = JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
    expect(ts.compilerOptions.strict).toBe(true);
    const engine = source.filter((s) => s.f.startsWith('src/engine/'));
    expect(engine.length).toBeGreaterThan(5);
    for (const { f, text } of engine) {
      expect(text, f).not.toMatch(/from ['"]react(-dom)?(\/[\w-]+)?['"]/);
      expect(text, f).not.toMatch(/from ['"]\.\.\/(components|screens|store|lib)\//);
    }
  });
});
