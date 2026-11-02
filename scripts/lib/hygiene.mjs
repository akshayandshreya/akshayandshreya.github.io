// Text hygiene (spec 4.4), ported from card.js keep() and the video's S.facts: non-breaking spaces where a line must
// not break, U+2060 word joiners around hyphens of the host line, and the two-line address split. Strings are otherwise
// copied byte for byte: these helpers never rewrite copy.

export const NBSP = '\u00a0';
export const WJ = '\u2060';

/**
 * Line-break hygiene for one string.
 * @param {string} str
 * @param {'en'|'hi'|'mai'|'bn'} lang
 * @param {{ name: string, honorific?: string | null }[]} names full names (with their honorifics) that never break
 */
export function keep(str, lang, names = []) {
  let t = String(str);
  if (lang === 'hi' || lang === 'mai') {
    t = t.replace(/ (पर|का|के|की|में|से|को|ने|क|मे|सँ|पास|समीप)(?=[ ।,]|$)/g, NBSP + '$1');
    t = t
      .replace(/(शुभ) /g, '$1' + NBSP)
      .replace(/(नं[.०]) /g, '$1' + NBSP)
      .replace(/(बस) (स्टैंड)/g, '$1' + NBSP + '$2');
  } else if (lang === 'bn') {
    t = t
      .replace(/(শুভ) /g, '$1' + NBSP)
      .replace(/(নং) /g, '$1' + NBSP)
      .replace(/(বাস) /g, '$1' + NBSP);
  } else {
    t = t
      .replace(/(Block) (H,)/g, '$1' + NBSP + '$2')
      .replace(/(Gate) (No)/g, '$1' + NBSP + '$2')
      .replace(/(bus) (stand)/g, '$1' + NBSP + '$2')
      .replace(/ (Rd,)/g, NBSP + '$1');
  }
  // a full name never breaks, and its honorific stays with it
  for (const { name, honorific } of names) {
    if (!name) continue;
    const nb = name.replace(/ /g, NBSP);
    t = t.split(name).join(nb);
    if (honorific) t = t.split(honorific + ' ' + nb).join(honorific.replace(/ /g, NBSP) + NBSP + nb);
  }
  return t;
}

/** The host line: U+2060 on both sides of each hyphen, so "गुरुजन-परिजनक" never breaks at the hyphen (card.js). */
export function joinHyphens(str) {
  return String(str).replace(/(\S)-(\S)/g, `$1${WJ}-${WJ}$2`);
}

/** Stand-alone conjunctions per language (mai "आ" = and; hi "आ" is a verb, so it is not listed there). */
const CONJUNCTIONS = { en: '&|and', hi: 'और|एवं|व', mai: 'आ|आओर|एवं|और', bn: 'ও|এবং' };

const DEVA_DIGIT = '[०-९]';
const BENG_DIGIT = '[০-৯]';

/**
 * Site rules on top of card.js keep() (spec 4.4 "line-break rules"). They only bind what the card binds by layout:
 * - a number never leaves its unit: "26 November", "6:00 PM", "२९ नवंबर", "संध्या ६ बजे" (the whole time phrase),
 *   "২৯শে নভেম্বর", "সন্ধ্যা ৬টা";
 * - no line starts with the middle-dot separator " · " (the dot stays with the word before it);
 * - the double danda of an invocation ("॥ श्री गणेशाय नमः ॥") never sits alone at a line end or start;
 * - a conjunction (& and, और एवं व, आ, ও এবং) never ends a line, and after a number it stays with that number too.
 * Only spaces become U+00A0 (every subset font has it). Hyphens are left alone here: U+2060 goes only into the host
 * line (joinHyphens, as card.js does), because the Devanagari and Bengali subsets carry no U+2060 glyph.
 * plain() of the result is the input again.
 * @param {string} str
 * @param {'en'|'hi'|'mai'|'bn'} lang
 */
export function bindUnits(str, lang) {
  let t = String(str);
  if (lang === 'en') {
    t = t
      .replace(/(\d) (AM|PM)\b/g, `$1${NBSP}$2`)
      .replace(
        /(\d) (January|February|March|April|May|June|July|August|September|October|November|December)\b/g,
        `$1${NBSP}$2`,
      );
  } else if (lang === 'hi' || lang === 'mai') {
    t = t
      .replace(new RegExp(`(\\S+) (${DEVA_DIGIT}+) (बजे)`, 'gu'), `$1${NBSP}$2${NBSP}$3`)
      .replace(new RegExp(`(${DEVA_DIGIT}) (बजे|नवंबर|नवम्बर)`, 'gu'), `$1${NBSP}$2`);
  } else if (lang === 'bn') {
    t = t
      .replace(new RegExp(`(\\S+) (${BENG_DIGIT}+টা)`, 'gu'), `$1${NBSP}$2`)
      .replace(new RegExp(`(${BENG_DIGIT}(?:শে|ই|লা|রা|ঠা)?) (নভেম্বর)`, 'gu'), `$1${NBSP}$2`);
  }
  // a conjunction never ends a line: "Mithila / & Bengal", "मिथिला / और बंगाल"; after a number it also stays with the
  // number, so a list of dates ("26 & 29 November") or a house number ("192B & C,") is one unit
  const conj = CONJUNCTIONS[lang];
  t = t
    .replace(new RegExp(`(?<=^|\\s)(${conj}) (?=\\S)`, 'gu'), `$1${NBSP}`)
    .replace(new RegExp(`(\\p{N}\\S*) (${conj})(?=\\u00a0)`, 'gu'), `$1${NBSP}$2`);
  t = t.replace(/ ·/g, `${NBSP}·`);
  t = t.replace(/^॥ /u, `॥${NBSP}`).replace(/ ॥$/u, `${NBSP}॥`);
  return t;
}

/** Every hygiene rule for one display string: card.js keep() (names included), then bindUnits(). */
export function hygiene(str, lang, names = []) {
  return bindUnits(keep(str, lang, names), lang);
}

/** Remove the hygiene characters (for comparisons with the source copy). */
export function plain(str) {
  return String(str)
    .replace(/\u00a0/g, ' ')
    .replace(/\u2060/g, '');
}

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : null;

/** Visual width estimate: grapheme clusters (a conjunct with its vowel signs counts once). */
export function graphemeLength(str) {
  const s = String(str);
  if (segmenter) {
    let n = 0;
    for (const _ of segmenter.segment(s)) n++;
    return n;
  }
  return [...s.replace(/\p{M}/gu, '')].length;
}

/**
 * Split an address into two lines after the comma that minimises the longer line (spec 4.4). The comma stays on the
 * first line. Joining the two parts with one space gives the input back.
 * @returns {[string, string]}
 */
export function splitAddress(str) {
  const s = String(str).trim();
  let best = null;
  for (let i = s.indexOf(', '); i !== -1; i = s.indexOf(', ', i + 1)) {
    const a = s.slice(0, i + 1);
    const b = s.slice(i + 2);
    const la = graphemeLength(a);
    const lb = graphemeLength(b);
    const score = [Math.max(la, lb), Math.abs(la - lb)];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
      best = { a, b, score };
    }
  }
  if (!best) throw new Error(`address without a comma cannot be split: "${s}"`);
  return [best.a, best.b];
}

/** Split once at the first occurrence of `sep`; the second part is null when `sep` is absent. */
export function splitFirst(str, sep) {
  const i = str.indexOf(sep);
  return i === -1 ? [str, null] : [str.slice(0, i), str.slice(i + sep.length)];
}
