#!/usr/bin/env node
// Spec 4.1: re-runs the validations on the COMMITTED src/i18n/*.json and checks they are not stale against the
// snapshot (a fresh in-memory generation must equal them, ignoring generatedAt), and that docs/NATIVE_REVIEW.md shows
// the current UI strings (spec 4.8). Prints the snapshot sha256 next to the source file's current sha256 when that
// path is reachable (risk R7: content drift).
import { existsSync, readFileSync } from 'node:fs';
import { LANGS } from './lib/model.mjs';
import { ROOT, SOURCE_PATH, generate, readInputs, sameIgnoringTime, sha256 } from './lib/generate.mjs';
import { validateAll } from './lib/validate.mjs';
import { reviewDocErrors } from './lib/review.mjs';

const inputs = readInputs();
const fresh = generate(inputs).files;
const committed = {};
const errors = [];
for (const lang of LANGS) {
  const path = `${ROOT}src/i18n/${lang}.json`;
  if (!existsSync(path)) {
    errors.push(`src/i18n/${lang}.json missing: run npm run gen:i18n`);
    continue;
  }
  committed[lang] = JSON.parse(readFileSync(path, 'utf8'));
  if (!sameIgnoringTime(committed[lang], fresh[lang]))
    errors.push(`src/i18n/${lang}.json is stale: run npm run gen:i18n`);
}
errors.push(...validateAll(committed, inputs.content, inputs.ui));
const reviewPath = `${ROOT}docs/NATIVE_REVIEW.md`;
if (existsSync(reviewPath)) errors.push(...reviewDocErrors(readFileSync(reviewPath, 'utf8'), inputs.ui));
else errors.push('docs/NATIVE_REVIEW.md missing');

let drift = '';
if (existsSync(SOURCE_PATH)) {
  const src = sha256(readFileSync(SOURCE_PATH));
  drift =
    src === inputs.contentSha256
      ? ' (matches the WeddingInvite2 source)'
      : ` (WeddingInvite2 source is now ${src.slice(0, 12)}: re-snapshot?)`;
}
if (errors.length) {
  console.error(`check-content: ${errors.length} error(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`check-content: ok. snapshot ${inputs.contentSha256.slice(0, 12)}${drift}`);
