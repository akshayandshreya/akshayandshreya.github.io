// Render the whole app at a URL (MemoryRouter), for the acceptance matrix in jsdom.
/* eslint-disable react-refresh/only-export-components -- test helpers, never hot-reloaded */
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from '../../../src/App';
import { ROUTER_FUTURE } from '../../../src/config';
import type { Lang, VariantKey } from '../../../src/i18n/types';
import { plainText } from '../../helpers';

export const LANGS: Lang[] = ['en', 'hi', 'mai', 'bn'];
export const VARIANTS: VariantKey[] = ['G1', 'G0', 'B1', 'B0'];

/** The query of a variant key (G1 is the default and has none). */
export function variantQuery(key: VariantKey): string {
  const q = new URLSearchParams();
  if (key[0] === 'B') q.set('side', 'bride');
  if (key[1] === '0') q.set('reception', '0');
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const location = { current: '' };
function Probe() {
  const l = useLocation();
  location.current = `${l.pathname}${l.search}${l.hash}`;
  return null;
}

export function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
      <App />
      <Probe />
    </MemoryRouter>,
  );
}

export const renderVariant = (lang: Lang, key: VariantKey, hash = '') => renderAt(`/${lang}/${variantQuery(key)}${hash}`);

/** Normalised text: hygiene characters removed, whitespace collapsed. */
export const norm = (s: string | null | undefined) => plainText(s ?? '').replace(/\s+/g, ' ').trim();

/** Every non-empty text node under `root`, normalised. */
export function textNodes(root: Node = document.body): { text: string; node: Text }[] {
  const out: { text: string; node: Text }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = norm(n.textContent);
    if (text) out.push({ text, node: n as Text });
  }
  return out;
}

/** Text of an element with its text nodes separated by newlines (so digit runs of neighbours never join). */
export const separatedText = (root: Node = document.body) =>
  textNodes(root)
    .map((t) => t.text)
    .join('\n');

/** Elements in document order? (a before b) */
export const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
