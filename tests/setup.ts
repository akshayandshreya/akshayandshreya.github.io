import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { primeLang } from '../src/i18n';
import type { LangFile } from '../src/i18n/types';
import en from '../src/i18n/en.json';
import hi from '../src/i18n/hi.json';
import mai from '../src/i18n/mai.json';
import bn from '../src/i18n/bn.json';

for (const f of [en, hi, mai, bn]) primeLang(f as unknown as LangFile);

// jsdom has no layout: scrolling is a no-op here
window.scrollTo = (() => undefined) as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
