// Spec 11 (ownership map and phases), checked against the repo on disk. The table of 11.1 is parsed from docs/SPEC.md:
// every file has exactly one owner (the most specific pattern wins), a pattern that names nothing and a path tagged
// "(Pn)" (planned for phase n) that already exists are reported as todo, and the phases of 11.2 are the six of the spec,
// each with its status and exit gate. A new file in a known area falls under that area's default pattern, so parallel
// work never fails here; a file in a new top-level place does, until 11.1 names its owner.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import specMd from '../../docs/SPEC.md?raw';
import pkg from '../../package.json';

const ROOT = process.cwd(); // vitest runs from the repo root

// Same exclusions as .gitignore (build output, installs, reports, OS litter) plus .git itself.
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-ssr',
  '.vite',
  'coverage',
  'playwright-report',
  'test-results',
  '.netlify',
  '.vercel',
  '.wrangler',
]);
const SKIP_FILE = /(\.log$)|(^\.DS_Store$)|(^\._)/;

function walk(dir = '', out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(rel, out);
    } else if (!SKIP_FILE.test(e.name)) out.push(rel);
  }
  return out;
}
const FILES = walk().sort();

/** One section of SPEC.md: from its heading to the next heading of the same or a higher level. */
function specBlock(heading: string): string {
  const lines = specMd.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) return '';
  const level = heading.match(/^#+/)![0].length;
  const end = lines.findIndex((l, i) => i > start && /^#+ /.test(l) && l.match(/^#+/)![0].length <= level);
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/** `{a,b}` alternatives (any number of groups, not nested). */
function expandBraces(p: string): string[] {
  const m = p.match(/\{([^{}]*)\}/);
  if (!m) return [p];
  return m[1]!.split(',').flatMap((alt) => expandBraces(p.replace(m[0], alt)));
}

interface Pattern {
  row: string; // spec section number of the 11.1 row
  text: string; // as written in the table
  glob: string; // one brace alternative
  re: RegExp;
  exact: boolean;
  score: number; // specificity: exact paths beat every glob, otherwise more literal characters wins
  phase: number | null; // "(Pn)": planned for phase n, not built yet
}

function toPattern(row: string, text: string, glob: string, phase: number | null): Pattern {
  const exact = !glob.includes('*');
  const src = glob
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) =>
      part === '**/'
        ? '(?:.*/)?'
        : part === '**'
          ? '.*'
          : part === '*'
            ? '[^/]*'
            : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return {
    row,
    text,
    glob,
    re: new RegExp(`^${src}$`),
    exact,
    score: exact ? Infinity : glob.replace(/\*/g, '').length,
    phase,
  };
}

// --- 11.1 ---------------------------------------------------------------------------------------------------------
const OWNERSHIP = specBlock('### 11.1');
const ROWS = OWNERSHIP.split('\n')
  .filter((l) => /^\| *\d+ *\|/.test(l))
  .map((l) => l.split('|').map((c) => c.trim()))
  .map((cells) => ({ row: cells[1]!, title: cells[2]!, cells: cells.slice(3, 5).join(' ') }));

const PATTERNS: Pattern[] = ROWS.flatMap(({ row, cells }) =>
  [...cells.matchAll(/`([^`]+)`( \(P(\d)\))?/g)].flatMap((m) => {
    const phase = m[3] === undefined ? null : Number(m[3]);
    return expandBraces(m[1]!).map((g) => toPattern(row, m[1]!, g, phase));
  }),
);

/** The owning patterns of a path: every match with the top specificity (more than one row = ambiguous). */
function owners(path: string): Pattern[] {
  const hits = PATTERNS.filter((p) => p.re.test(path));
  const top = Math.max(...hits.map((p) => p.score));
  return hits.filter((p) => p.score === top);
}

const SPEC_SECTIONS = [...specMd.matchAll(/^## (\d+)\. /gm)].map((m) => m[1]!);
const SHARED = [...specBlock('#### 11.1.1').matchAll(/`([^`]+)`/g)]
  .flatMap((m) => expandBraces(m[1]!))
  .filter((p) => p.includes('/') || p.includes('.'));

describe('11.1 who owns what', () => {
  it('has one row per spec section, in order', () => {
    expect(SPEC_SECTIONS.length).toBeGreaterThan(10);
    expect(ROWS.map((r) => r.row)).toEqual(SPEC_SECTIONS);
  });

  it('every file in the repo has exactly one owner', () => {
    const unowned = FILES.filter((f) => owners(f).length === 0);
    const ambiguous = FILES.map((f) => ({ f, rows: [...new Set(owners(f).map((p) => p.row))] })).filter(
      (x) => x.rows.length > 1,
    );
    expect(unowned, 'files no pattern of 11.1 matches: add them to the owning row').toEqual([]);
    expect(ambiguous, 'files two rows claim with equally specific patterns').toEqual([]);
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('no row claims the same pattern twice, and no two rows claim the same pattern', () => {
    const seen = new Map<string, string>();
    for (const p of PATTERNS) {
      expect(seen.get(p.glob), `${p.glob} in rows ${seen.get(p.glob)} and ${p.row}`).toBeUndefined();
      seen.set(p.glob, p.row);
    }
  });

  // A pattern that names nothing is reported, not failed (as in c7-layout): the parallel agents of a phase commit in any
  // order, so a row may name a file before its commit lands. It shows in the report until the file exists or the
  // path is fixed or tagged (Pn).
  for (const p of PATTERNS.filter((x) => x.phase === null && !FILES.some((f) => x.re.test(f)))) {
    it.todo(`row ${p.row}: ${p.glob} names no file yet (fix the path or tag it (Pn))`);
  }

  it('a planned path is exact, belongs to its own row once built, and names a phase of 11.2', () => {
    for (const p of PATTERNS.filter((x) => x.phase !== null)) {
      expect(p.exact, `${p.glob} (P${p.phase}) is a path, not a pattern`).toBe(true);
      expect([...new Set(owners(p.glob).map((o) => o.row))], `${p.glob} would be owned by`).toEqual([p.row]);
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThanOrEqual(5);
    }
  });

  for (const p of PATTERNS.filter((x) => x.phase !== null)) {
    if (FILES.includes(p.glob)) it.todo(`${p.glob} exists now: drop its (P${p.phase}) tag in 11.1 row ${p.row}`);
  }

  it('the shared files of 11.1.1 exist and each has an owning row', () => {
    expect(SHARED.length).toBeGreaterThan(8);
    for (const s of SHARED) {
      const re = toPattern('', s, s, null).re;
      const matched = FILES.filter((f) => re.test(f));
      expect(matched.length, `${s} names a file`).toBeGreaterThan(0);
      for (const f of matched) expect(owners(f).length, f).toBe(1);
    }
  });

  it('every unit and e2e test belongs to a row (the tests column is part of the map)', () => {
    for (const f of FILES.filter((x) => /^tests\/(unit|e2e)\/[^/]+\.(test|spec)\.tsx?$/.test(x)))
      expect(owners(f).length, f).toBe(1);
    expect(owners('tests/unit/ownership.test.ts').map((p) => p.row)).toEqual(['11']);
  });
});

// --- 11.2 ---------------------------------------------------------------------------------------------------------
const PHASES_MD = specBlock('### 11.2');
const PHASES = [...PHASES_MD.matchAll(/^(\d)\. \*\*([^*]+)\*\*/gm)].map((m) => ({
  n: Number(m[1]),
  name: m[2]!,
  at: m.index!,
}));
const phaseText = (i: number) => PHASES_MD.slice(PHASES[i]!.at, PHASES[i + 1]?.at);

describe('11.2 phases', () => {
  it('are the six phases of the spec, numbered 0-5 in order', () => {
    expect(PHASES.map((p) => p.n)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(PHASES.map((p) => p.name.toLowerCase())).toEqual([
      'scaffold',
      'assets',
      'static sections',
      'motion',
      'optional modules and hosting',
      'qa',
    ]);
  });

  it('each phase names its 11.1 rows, its exit gate and its status', () => {
    PHASES.forEach((p, i) => {
      const text = phaseText(i);
      expect(text, `phase ${p.n} rows`).toMatch(/Rows:/);
      expect(text, `phase ${p.n} exit`).toMatch(/Exit:/);
      expect(text, `phase ${p.n} status`).toMatch(/Status \(\d{4}-\d{2}-\d{2}\):/);
    });
  });

  it('the common exit gate runs real npm scripts on dvd and commits on the Mac with explicit paths', () => {
    const gate = PHASES_MD.slice(0, PHASES[0]!.at);
    const scripts = (pkg as unknown as { scripts: Record<string, string> }).scripts;
    const named = [...gate.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]!);
    expect(named).toEqual(expect.arrayContaining(['typecheck', 'build']));
    for (const s of named) expect(scripts[s], `npm run ${s}`).toBeTruthy();
    expect(gate).toMatch(/npm test/);
    expect(gate).toMatch(/dev-dsk-anaaks-2b-9537f078/);
    expect(gate).toMatch(/git add <explicit paths>/);
    expect(gate).toMatch(/never push/i);
  });

  it('a phase marked done has no planned path left in 11.1', () => {
    const done = PHASES.filter((_, i) => /Status \([^)]*\): done/.test(phaseText(i))).map((p) => p.n);
    const left = PATTERNS.filter((p) => p.phase !== null && done.includes(p.phase)).map(
      (p) => `${p.glob} (P${p.phase})`,
    );
    expect(left).toEqual([]);
  });

  it('every phase that is not done has something left (a planned path, or an open follow-up of 10.3)', () => {
    PHASES.forEach((p, i) => {
      const text = phaseText(i);
      if (/Status \([^)]*\): done/.test(text)) return;
      const planned = PATTERNS.some((x) => x.phase === p.n);
      expect(planned || /\bF\d\b/.test(text) || /\bLeft:/.test(text), `phase ${p.n} says what is left`).toBe(true);
    });
  });
});
