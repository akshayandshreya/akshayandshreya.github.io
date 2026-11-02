// The visible sections of the current variant (spec 2.2), shared by the page, the section nav and the hash mapping.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { config } from '../config';
import { useCopy } from '../i18n/context';
import { WEDDING_START_UTC } from '../generated/facts';
import { sectionFlags, visibleSections, type SectionFlags, type SectionId } from '../lib/sections';
import { useNow } from './clock';

interface PageState {
  visible: SectionId[];
  flags: SectionFlags;
  /** null until mounted (server and first render). */
  now: number | null;
}

const PageContext = createContext<PageState | null>(null);
const WEDDING_START = Date.parse(WEDDING_START_UTC);

export function PageProvider({ children }: { children: ReactNode }) {
  const copy = useCopy();
  const now = useNow(config.countdown.showSeconds ? 1000 : 60_000);
  // the countdown disappears at the wedding start (2.3.3); before mount it is shown, as the prerender shows it
  const countdownLive = now === null || now < WEDDING_START;
  const value = useMemo<PageState>(() => {
    const flags = sectionFlags(config, countdownLive);
    return { visible: visibleSections(copy, flags), flags, now };
  }, [copy, countdownLive, now]);
  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

/** The page state, or null outside a <PageProvider> (components that also render on their own, e.g. in tests). */
export function usePageOptional(): PageState | null {
  return useContext(PageContext);
}

export function usePage(): PageState {
  const ctx = useContext(PageContext);
  if (!ctx) throw new Error('usePage outside <PageProvider>');
  return ctx;
}
