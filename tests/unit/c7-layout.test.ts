// Spec 7.1 (repository layout) and 7.3 (npm scripts, dependency policy), checked against the repo itself. Files of 7.1
// that do not exist yet are listed as todo (visible in the test report), not failures: the tree grows section by
// section. A file may live at an agreed alternative path (for example the generated art in src/assets, see its README).
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import gitignore from '../../.gitignore?raw';

// lazy globs: only the file names are used, nothing is loaded
const REPO = Object.keys({
  ...import.meta.glob('/*.{json,ts,html,toml,md}'),
  ...import.meta.glob(
    '/{src,scripts,tools,content,docs,public,tests}/**/*.{ts,tsx,mjs,js,json,css,md,html,svg,sh,txt,webmanifest}',
  ),
  ...import.meta.glob('/public/_redirect[s]'),
}).map((k) => k.slice(1));
const has = (p: string) => REPO.includes(p) || REPO.some((f) => f.startsWith(`${p}/`));

/** 7.1, src/ (alternatives after "|"). */
const SRC_TREE = [
  'src/main.tsx',
  'src/entry-server.tsx',
  'src/App.tsx',
  'src/config.ts',
  'src/routes/RootRedirect.tsx',
  'src/routes/LangLayout.tsx',
  'src/routes/NotFound.tsx',
  'src/state/variant.ts',
  'src/state/scrollspy.ts|src/state/scrollspy.tsx',
  'src/i18n/en.json',
  'src/i18n/hi.json',
  'src/i18n/mai.json',
  'src/i18n/bn.json',
  'src/i18n/types.ts',
  'src/i18n/index.ts',
  ...[
    'ics',
    'maps',
    'google-calendar',
    'numerals',
    'countdown',
    'motion',
    'parallax',
    'plates',
    'sprites',
    'breakpoints',
    'head',
    'linedraw',
    'dom',
  ].map((f) => `src/lib/${f}.ts`),
  ...['TopBar', 'LanguageSwitch', 'SectionNav', 'SkipLink', 'Footer', 'MusicToggle', 'HeadManager'].map(
    (c) => `src/components/chrome/${c}.tsx`,
  ),
  ...[
    'PlateSection',
    'Plate',
    'GoldLayer',
    'Veil',
    'LightSweep',
    'GlowPulse',
    'LiveStrokes',
    'PaintReveal',
    'BrushEdge',
    'Hairlines',
    'PaperBand',
  ].map((c) => `src/components/paint/${c}.tsx`),
  ...['Reveal', 'HandTitle', 'GoldLeaf', 'Facts', 'Dateline', 'NamesBlock', 'Monogram', 'GoldRule'].map(
    (c) => `src/components/text/${c}.tsx`,
  ),
  ...[
    'Sprite',
    'LineArt',
    'Ganesh',
    'Diya',
    'Particles',
    'EdgeMotifs',
    'EveningLights',
    'TirhutaFlourish',
    'Ghost',
  ].map((c) => `src/components/motifs/${c}.tsx`),
  ...['AddToCalendar', 'OpenInMaps', 'Disclosure'].map((c) => `src/components/actions/${c}.tsx`),
  'src/components/motion/MotionProvider.tsx',
  ...[
    'Opening',
    'Invitation',
    'Countdown',
    'Celebrations',
    'EventSection',
    'EventActions',
    'Cultures',
    'Venues',
    'VenueCard',
    'Rsvp',
    'Gallery',
    'Closing',
  ].map((c) => `src/sections/${c}.tsx`),
  ...['tokens', 'palettes', 'typography', 'base', 'layout', 'motion'].map((s) => `src/styles/${s}.css`),
  'src/styles/fonts.en.css|src/assets/fonts/fonts.en.css',
  'src/generated/plates.json|src/assets/plates.json',
  'src/generated/sprites.json|src/assets/sprites.json',
  'src/generated/facts.ts',
  'src/generated/font-coverage.json|src/assets/fonts/font-coverage.json',
  'src/generated/tirhuta-mithila.svg|src/assets/glyphs/tirhuta-mithila.svg',
];

/** 7.1, everything outside src/ that the build, the tests and the hosting need. */
const REPO_TREE = [
  'README.md',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'index.html',
  'vercel.json',
  'netlify.toml',
  'content/content.json',
  'content/SOURCE.md',
  'content/ui.json',
  'scripts/gen-i18n.mjs',
  'scripts/check-content.mjs',
  'scripts/lib/merge.mjs',
  'scripts/lib/hygiene.mjs',
  'scripts/prerender.mjs',
  'scripts/subset-fonts.mjs',
  'scripts/check-budget.mjs',
  'scripts/sync.sh',
  'tools/plates/export.mjs',
  'tools/plates/recipes.js',
  'tools/plates/plates.html',
  'tools/plates/vendor/SOURCE.md',
  'tools/glyphs/tirhuta.mjs',
  'tools/og/og.mjs',
  'tools/shots/shots.mjs',
  'public/redirect.js',
  'public/robots.txt',
  'public/favicon.svg',
  'public/site.webmanifest',
  'public/_redirects',
  'docs/SPEC.md',
  'docs/NATIVE_REVIEW.md',
  'docs/QA.md',
];

/** Section 7's own files and the shell: these must exist now. */
const REQUIRED_NOW = new Set([
  'src/main.tsx',
  'src/entry-server.tsx',
  'src/App.tsx',
  'src/config.ts',
  'src/routes/RootRedirect.tsx',
  'src/routes/LangLayout.tsx',
  'src/routes/NotFound.tsx',
  'src/lib/dom.ts',
  'src/components/paint/Plate.tsx',
  'src/components/paint/GoldLayer.tsx',
  'src/components/paint/PaperBand.tsx',
  'src/components/text/Facts.tsx',
  'src/components/text/Dateline.tsx',
  'src/components/text/NamesBlock.tsx',
  'src/components/text/Monogram.tsx',
  'src/components/text/GoldRule.tsx',
  'src/components/motifs/Sprite.tsx',
  'src/components/motifs/Ganesh.tsx',
  'src/components/motifs/TirhutaFlourish.tsx',
  'src/components/motifs/Ghost.tsx',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'index.html',
]);

describe('7.1 repository layout', () => {
  for (const entry of [...SRC_TREE, ...REPO_TREE]) {
    const options = entry.split('|');
    const present = options.some(has);
    if (present || REQUIRED_NOW.has(options[0]!)) {
      it(entry, () => expect(present, `${entry} exists`).toBe(true));
    } else {
      it.todo(`${entry} (7.1, not built yet)`);
    }
  }

  it('.gitignore keeps installs, build output and test reports out of git', () => {
    const lines = gitignore.split(/\r?\n/).map((l) => l.trim().replace(/^\//, '').replace(/\/$/, ''));
    for (const p of [
      'node_modules',
      'dist',
      'dist-ssr',
      '.vite',
      'coverage',
      'playwright-report',
      'test-results',
      '*.log',
    ])
      expect(lines, p).toContain(p);
  });

  it('the Mac repo stays free of build output and installs (0.2 rule 6)', () => {
    expect(REPO.some((f) => /^(node_modules|dist|dist-ssr)\//.test(f))).toBe(false);
  });
});

type Pkg = {
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const P = pkg as unknown as Pkg;

describe('7.3 npm scripts', () => {
  it('dev and preview bind inside Docker only (the host publishes them on 127.0.0.1)', () => {
    expect(P.scripts.dev).toBe('vite --host 0.0.0.0 --port 5173');
    expect(P.scripts.preview).toBe('vite preview --host 0.0.0.0 --port 4173');
  });

  it('build runs gen:i18n -> check:content -> client build -> SSR build -> prerender -> budget, in that order', () => {
    const expand = (s: string): string =>
      s.replace(/npm run ([\w:-]+)/g, (_, name: string) => expand(P.scripts[name] ?? `<missing ${name}>`));
    const build = expand(P.scripts.build!);
    const steps = [
      'node scripts/gen-i18n.mjs',
      'node scripts/check-content.mjs',
      'vite build',
      'vite build --ssr src/entry-server.tsx --outDir dist-ssr',
      'node scripts/prerender.mjs',
      'node scripts/check-budget.mjs',
    ];
    let at = -1;
    for (const s of steps) {
      const i = build.indexOf(s, at + 1);
      expect(i, `"${s}" after the previous step in: ${build}`).toBeGreaterThan(at);
      at = i;
    }
    expect(build).not.toMatch(/<missing/);
  });

  it('test = vitest run + check:content; e2e = playwright test; shots = the screenshot matrix', () => {
    expect(P.scripts.test).toBe('vitest run && npm run check:content');
    expect(P.scripts.e2e).toBe('playwright test');
    expect(P.scripts.shots).toBe('node tools/shots/shots.mjs');
  });

  it('assets:* cover every tool of 6.5 and point at files that exist', () => {
    for (const name of ['plates', 'sprites', 'motifs', 'fonts', 'glyphs', 'og'])
      expect(P.scripts[`assets:${name}`], name).toBeTruthy();
    const files = Object.entries(P.scripts)
      .filter(([k]) => k === 'assets' || k.startsWith('assets:'))
      .flatMap(([, cmd]) => [...cmd.matchAll(/node ((?:tools|scripts)\/\S+\.mjs)/g)].map((m) => m[1]!));
    expect(files.length).toBeGreaterThan(6);
    for (const f of new Set(files)) expect(REPO, f).toContain(f);
  });

  it('npm run build never runs an asset tool (6.5: no Chromium, sharp or Python needed to build)', () => {
    const build = [P.scripts.build, P.scripts['build:client'], P.scripts['build:ssr']].join(' ');
    expect(build).not.toMatch(/tools\/|assets:|playwright|sharp|subset-fonts/);
  });
});

describe('7.3 dependencies', () => {
  const all = { ...P.dependencies, ...P.devDependencies };

  it('runtime: react, react-dom 18.3.x and react-router-dom 6.28.x, nothing else', () => {
    expect(Object.keys(P.dependencies).sort()).toEqual(['react', 'react-dom', 'react-router-dom']);
    expect(P.dependencies.react).toMatch(/^18\.3\.\d+$/);
    expect(P.dependencies['react-dom']).toMatch(/^18\.3\.\d+$/);
    expect(P.dependencies['react-router-dom']).toMatch(/^6\.28\.\d+$/);
  });

  it('dev: vite 5, the React plugin, TypeScript 5, vitest, testing-library, jsdom, Playwright + axe, sharp, svgo, harfbuzzjs', () => {
    expect(P.devDependencies.vite).toMatch(/^5\./);
    expect(P.devDependencies.typescript).toMatch(/^5\./);
    for (const d of [
      '@vitejs/plugin-react',
      'vitest',
      '@testing-library/react',
      'jsdom',
      '@playwright/test',
      '@axe-core/playwright',
      'sharp',
      'svgo',
      'harfbuzzjs',
    ])
      expect(P.devDependencies[d], d).toBeTruthy();
  });

  it('every version is pinned exactly', () => {
    const loose = Object.entries(all).filter(([, v]) => !/^\d+\.\d+\.\d+$/.test(v));
    expect(loose).toEqual([]);
  });

  it('no UI kit, CSS framework, animation library or i18n library (the copy is pre-resolved JSON)', () => {
    const denied = [
      /^@mui\//,
      /^@material-ui\//,
      /^@chakra-ui\//,
      /^antd$/,
      /^@mantine\//,
      /^@radix-ui\//,
      /^@headlessui\//,
      /^react-bootstrap$/,
      /^bootstrap$/,
      /^bulma$/,
      /^tailwindcss$/,
      /^@tailwindcss\//,
      /^styled-components$/,
      /^@emotion\//,
      /^@stitches\//,
      /^framer-motion$/,
      /^motion$/,
      /^gsap$/,
      /^@react-spring\//,
      /^react-spring$/,
      /^animejs$/,
      /^lottie/,
      /^aos$/,
      /^locomotive-scroll$/,
      /^lenis$/,
      /^@studio-freight\//,
      /^i18next$/,
      /^react-i18next$/,
      /^react-intl$/,
      /^@formatjs\//,
      /^@lingui\//,
      /^next-intl$/,
      /^rosetta$/,
    ];
    const hits = Object.keys(all).filter((n) => denied.some((re) => re.test(n)));
    expect(hits).toEqual([]);
  });
});
