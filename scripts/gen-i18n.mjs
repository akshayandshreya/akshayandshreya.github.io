#!/usr/bin/env node
// Spec 4.1: content/content.json + content/ui.json -> src/i18n/{en,hi,mai,bn}.json (four pre-resolved variants each:
// G1 G0 B1 B0), src/generated/facts.ts and src/generated/ui-keys.ts. Validates everything; any error fails the build.
// It also refreshes the UI-string table of docs/NATIVE_REVIEW.md (spec 4.8), keeping the reviewers' answers.
// A file is rewritten only when its content (other than source.generatedAt) changed, so builds stay reproducible.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LANGS } from './lib/model.mjs';
import { ROOT, generate, readInputs, sameIgnoringTime } from './lib/generate.mjs';
import { validateAll } from './lib/validate.mjs';
import { updateReviewDoc } from './lib/review.mjs';

const inputs = readInputs();
const { files, factsTs, uiKeysTs } = generate(inputs);

const errors = validateAll(files, inputs.content, inputs.ui);
if (errors.length) {
  console.error(`gen-i18n: ${errors.length} validation error(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}

mkdirSync(`${ROOT}src/i18n`, { recursive: true });
mkdirSync(`${ROOT}src/generated`, { recursive: true });
const now = new Date().toISOString();
const written = [];
for (const lang of LANGS) {
  const path = `${ROOT}src/i18n/${lang}.json`;
  const next = files[lang];
  if (existsSync(path)) {
    const prev = JSON.parse(readFileSync(path, 'utf8'));
    if (sameIgnoringTime(prev, next)) continue;
  }
  next.source.generatedAt = now;
  writeFileSync(path, JSON.stringify(next, null, 1) + '\n');
  written.push(`src/i18n/${lang}.json`);
}
for (const [rel, text] of [
  ['src/generated/facts.ts', factsTs],
  ['src/generated/ui-keys.ts', uiKeysTs],
]) {
  const path = `${ROOT}${rel}`;
  if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
  writeFileSync(path, text);
  written.push(rel);
}

// docs/NATIVE_REVIEW.md: the table follows ui.json; prettier (a dev dependency) keeps it in the repo's format
const reviewPath = `${ROOT}docs/NATIVE_REVIEW.md`;
if (existsSync(reviewPath)) {
  const before = readFileSync(reviewPath, 'utf8');
  let after = updateReviewDoc(before, inputs.ui);
  try {
    const prettier = await import('prettier');
    const options = (await prettier.resolveConfig(reviewPath)) ?? {};
    after = await prettier.format(after, { ...options, filepath: reviewPath });
  } catch {
    // no prettier (a bare checkout): the table is still correct, only not column-aligned
  }
  if (after !== before) {
    writeFileSync(reviewPath, after);
    written.push('docs/NATIVE_REVIEW.md');
  }
}

const v = files.en.variants;
console.log(
  `gen-i18n: ok. content ${inputs.contentSha256.slice(0, 12)}, ui ${inputs.uiSha256.slice(0, 12)}; ` +
    `${LANGS.length} languages x 4 variants; events G1 ${v.G1.events.length}, G0 ${v.G0.events.length}; ` +
    `${Object.keys(files.en.ui).length} UI strings. ` +
    (written.length ? `wrote ${written.join(', ')}` : 'no changes'),
);
