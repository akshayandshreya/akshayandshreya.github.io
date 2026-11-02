// The UI-string table of docs/NATIVE_REVIEW.md (spec 4.8), kept in step with content/ui.json. gen-i18n rewrites the
// block between the two markers (keeping what reviewers wrote in the Review column); check-content fails when the
// table no longer shows the current strings. Pure: no I/O.
import { LANGS } from './model.mjs';

export const START = '<!-- ui-review:start -->';
export const END = '<!-- ui-review:end -->';
const HEADER = [
  'Key',
  'en',
  'hi (draft)',
  'mai (draft)',
  'bn (draft)',
  'What to check',
  'Review (ok, or the replacement)',
];

const show = (x) => (typeof x === 'string' ? x : `${x.one} / ${x.other}`);
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const unCell = (s) => s.replace(/\\\|/g, '|').trim();

/** Is `key` (or `key.lang`) in ui.reviewed? */
export const isReviewed = (ui, key, lang) => (ui.reviewed ?? []).some((r) => r === key || r === `${key}.${lang}`);

/** One row per UI key: { key, en, hi, mai, bn, check } as displayed. */
export function reviewRows(ui) {
  return Object.entries(ui.strings).map(([key, byLang]) => {
    const row = { key, check: ui.review?.[key] ?? '' };
    for (const lang of LANGS) {
      const text = show(byLang[lang]);
      row[lang] = lang !== 'en' && isReviewed(ui, key, lang) ? `${text} (reviewed)` : text;
    }
    return row;
  });
}

/** Split one markdown table row into its cells (escaped pipes stay inside a cell). */
function splitRow(line) {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return null;
  return t
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map(unCell);
}

/** The table between the markers: Map key -> { en, hi, mai, bn, check, review }. Null when the markers are missing. */
export function parseReviewTable(md) {
  const a = md.indexOf(START);
  const b = md.indexOf(END);
  if (a === -1 || b === -1 || b < a) return null;
  const out = new Map();
  for (const line of md.slice(a + START.length, b).split('\n')) {
    const cells = splitRow(line);
    if (!cells || cells.length < 7) continue;
    const key = cells[0].replace(/`/g, '');
    if (key === 'Key' || /^:?-+:?$/.test(key)) continue;
    const [, en, hi, mai, bn, check, review] = cells;
    out.set(key, { en, hi, mai, bn, check, review });
  }
  return out;
}

/** The markdown block (markers included) for the current ui.json, keeping the reviewers' answers by key. */
export function renderReviewTable(ui, previous = new Map()) {
  const lines = [START, '', `| ${HEADER.join(' | ')} |`, `| ${HEADER.map(() => '---').join(' | ')} |`];
  for (const r of reviewRows(ui)) {
    const review = previous.get(r.key)?.review ?? '';
    lines.push(`| ${['`' + r.key + '`', r.en, r.hi, r.mai, r.bn, r.check, review].map(cell).join(' | ')} |`);
  }
  lines.push('', END);
  return lines.join('\n');
}

/** The whole document with its table block replaced. Throws when the markers are missing. */
export function updateReviewDoc(md, ui) {
  const previous = parseReviewTable(md);
  if (!previous) throw new Error(`docs/NATIVE_REVIEW.md: markers ${START} ... ${END} not found`);
  const a = md.indexOf(START);
  const b = md.indexOf(END) + END.length;
  return md.slice(0, a) + renderReviewTable(ui, previous) + md.slice(b);
}

/** Errors when the document's table does not show the current ui.json strings (formatting is ignored). */
export function reviewDocErrors(md, ui) {
  const table = parseReviewTable(md);
  if (!table) return [`docs/NATIVE_REVIEW.md: markers ${START} ... ${END} not found`];
  const errors = [];
  const rows = reviewRows(ui);
  for (const r of rows) {
    const got = table.get(r.key);
    if (!got) {
      errors.push(`docs/NATIVE_REVIEW.md: no row for ${r.key}`);
      continue;
    }
    for (const col of ['en', 'hi', 'mai', 'bn', 'check']) {
      if (got[col] !== r[col].trim())
        errors.push(`docs/NATIVE_REVIEW.md: ${r.key} ${col} is "${got[col]}", not "${r[col]}"`);
    }
  }
  for (const key of table.keys()) {
    if (!rows.some((r) => r.key === key)) errors.push(`docs/NATIVE_REVIEW.md: row ${key} is not in ui.json`);
  }
  if (errors.length) errors.push('docs/NATIVE_REVIEW.md is stale: run npm run gen:i18n');
  return errors;
}
