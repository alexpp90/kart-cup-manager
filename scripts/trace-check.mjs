// Requirements traceability: docs/requirements.md × test titles × last results.
// Writes docs/traceability.md. Exits 1 when
//   - a "must" requirement tagged `auto` has no test,
//   - a "must" requirement tagged `manual` is missing from docs/manual-test.md,
//   - a test refers to an unknown requirement ID,
//   - a test in the last results has no requirement ID in its title,
//   - a covering test failed in the last run.
// A requirement whose text starts with "Replaced by REQ-…" stays in the table as history; it needs
// no test any more, and the replacing ID must exist.
// Last results come from reports/vitest.json and reports/playwright.json (written by `npm test`
// and `npm run e2e`); if absent the matrix shows "not run" and only the static checks apply.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(root, p);
const ID = /REQ-[A-Z0-9]+-\d{3}/g;

// ---- requirements
const reqText = readFileSync(path.join(root, 'docs/requirements.md'), 'utf8');
const reqs = [];
for (const line of reqText.split('\n')) {
  const m = line.match(/^\|\s*(REQ-[A-Z0-9]+-\d{3})\s*\|(.+)\|\s*(must|should)\s*\|\s*(auto|manual)\s*\|\s*$/);
  if (!m) continue;
  const cells = m[2].split('|').map((c) => c.trim());
  const replacedBy = cells[0].match(/^\*{0,2}Replaced by (REQ-[A-Z0-9]+-\d{3})/)?.[1] ?? null;
  reqs.push({ id: m[1], text: cells[0], source: cells.slice(1).join(' | '), prio: m[3], kind: m[4], tests: [], replacedBy });
}
const byId = new Map(reqs.map((r) => [r.id, r]));
for (const r of reqs) if (r.replacedBy && !byId.has(r.replacedBy)) {
  console.error(`${r.id} is replaced by unknown ${r.replacedBy}`);
  process.exit(1);
}
if (new Set(reqs.map((r) => r.id)).size !== reqs.length) {
  console.error('duplicate requirement IDs in docs/requirements.md');
  process.exit(1);
}

// ---- static scan of test files
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'node_modules') walk(p, out);
    } else if (/\.(test|spec)\.ts$/.test(f)) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'e2e'))];
const problems = [];
const titleCall = /\b(?:describe|it|test)(?:\.\w+)*(?:\.each\([^)]*\))?\(\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")/;
let staticTests = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const m = line.match(titleCall);
    if (!m) return;
    const title = m[1] ?? m[2] ?? m[3];
    if (/\b(it|test)(\.\w+)*(\.each\([^)]*\))?\(/.test(line)) staticTests++;
    for (const id of title.match(ID) ?? []) {
      const r = byId.get(id);
      if (!r) problems.push(`${rel(file)}:${i + 1}: unknown requirement ${id}`);
      else if (!r.tests.some((t) => t.file === rel(file) && t.title === title)) r.tests.push({ file: rel(file), line: i + 1, title, status: 'not run' });
    }
  });
}

// ---- last results
const results = []; // {fullName, status}
const vit = path.join(root, 'reports/vitest.json');
if (existsSync(vit)) {
  const j = JSON.parse(readFileSync(vit, 'utf8'));
  for (const f of j.testResults ?? []) for (const a of f.assertionResults ?? []) results.push({ fullName: a.fullName ?? a.title, status: a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'FAIL' : 'skip', where: 'unit' });
}
const pw = path.join(root, 'reports/playwright.json');
if (existsSync(pw)) {
  const j = JSON.parse(readFileSync(pw, 'utf8'));
  const walkSuite = (s, trail) => {
    const t = s.title && !/\.spec\.ts$/.test(s.title) ? [...trail, s.title] : trail;
    for (const spec of s.specs ?? []) {
      const name = [...t, spec.title].join(' ');
      for (const test of spec.tests ?? []) {
        const last = test.results?.[test.results.length - 1];
        const st = test.status === 'skipped' ? 'skip' : test.status === 'expected' || test.status === 'flaky' ? 'pass' : last?.status === 'passed' ? 'pass' : 'FAIL';
        results.push({ fullName: name, status: st, where: `e2e:${test.projectName}` });
      }
    }
    for (const c of s.suites ?? []) walkSuite(c, t);
  };
  for (const s of j.suites ?? []) walkSuite(s, []);
}
const haveResults = results.length > 0;
for (const res of results) {
  const ids = res.fullName.match(ID) ?? [];
  if (!ids.length) {
    if (res.status !== 'skip') problems.push(`test without requirement ID (${res.where}): ${res.fullName}`);
    continue;
  }
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    r.results = r.results ?? [];
    r.results.push(res);
  }
}
for (const r of reqs) {
  const rs = r.results ?? [];
  r.status = !rs.length ? 'not run' : rs.some((x) => x.status === 'FAIL') ? 'FAIL' : rs.some((x) => x.status === 'pass') ? 'pass' : 'skip';
  if (r.status === 'FAIL') problems.push(`${r.id}: failing test(s): ${rs.filter((x) => x.status === 'FAIL').map((x) => x.fullName).join('; ')}`);
}

// ---- manual checklist + coverage
const manualText = existsSync(path.join(root, 'docs/manual-test.md')) ? readFileSync(path.join(root, 'docs/manual-test.md'), 'utf8') : '';
const gaps = [];
for (const r of reqs) {
  if (r.replacedBy) continue;
  if (r.kind === 'manual') {
    r.manual = manualText.includes(r.id);
    if (!r.manual && r.prio === 'must') gaps.push(`${r.id}: must/manual but missing from docs/manual-test.md`);
  } else if (!r.tests.length && r.prio === 'must') gaps.push(`${r.id}: must requirement has no test`);
}

// ---- report
const icon = { pass: '✅', FAIL: '❌', 'not run': '⚪', skip: '⏭️' };
let md = `# Traceability matrix\n\n_Generated by \`npm run trace:check\` from \`docs/requirements.md\`, test titles and the last test results (${haveResults ? 'reports/*.json' : 'no results found, run the tests first'}). Do not edit._\n\n`;
const live = reqs.filter((r) => !r.replacedBy);
const total = live.length;
const covered = live.filter((r) => r.tests.length || (r.kind === 'manual' && r.manual)).length;
md += `**${covered}/${total}** requirements covered · **${live.filter((r) => r.prio === 'must' && r.kind === 'auto' && r.tests.length).length}/${live.filter((r) => r.prio === 'must' && r.kind === 'auto').length}** automated "must" covered · ${live.filter((r) => r.kind === 'manual').length} manual · ${reqs.length - live.length} replaced · ${staticTests} test titles scanned\n\n`;
md += `| ID | Prio | Kind | Last | Requirement | Tests |\n|---|---|---|---|---|---|\n`;
for (const r of reqs) {
  const tests = r.replacedBy ? `replaced by ${r.replacedBy}` : r.kind === 'manual' ? `manual checklist ${r.manual ? '✔' : '✘ missing'}` : r.tests.length ? r.tests.map((t) => `\`${t.file}\`: ${t.title.replace(/\|/g, '\\|').replace(/\[REQ-[A-Z0-9]+-\d{3}\]\s*/g, '').slice(0, 70)}`).join('<br>') : '**none**';
  md += `| ${r.id} | ${r.prio} | ${r.kind} | ${r.replacedBy ? '♻️' : r.kind === 'manual' ? '📝' : icon[r.status]} | ${r.text.replace(/\|/g, '\\|')} | ${tests} |\n`;
}
if (gaps.length) md += `\n## Gaps\n\n${gaps.map((g) => `* ${g}`).join('\n')}\n`;
writeFileSync(path.join(root, 'docs/traceability.md'), md);

for (const g of gaps) problems.push(g);
console.log(`trace:check: ${covered}/${total} requirements covered, ${haveResults ? results.length + ' results read' : 'no results found'}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((p) => '  ✘ ' + p).join('\n'));
  process.exit(1);
}
