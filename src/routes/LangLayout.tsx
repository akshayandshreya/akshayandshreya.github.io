// "/:lang/*" (spec 2.1, 7.2): canonicalise the path (aliases, case, trailing slash, extra segments) with a replace
// that keeps the query and hash; then the language's copy, the motion tier, the chrome and the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsomorphicLayoutEffect } from '../lib/dom';
import { Navigate, useLocation } from 'react-router-dom';
import { CopyProvider, useI18n } from '../i18n/context';
import { resolvePath } from '../lib/langs';
import { resolveSectionHash } from '../lib/sections';
import { WEDDING_START_UTC } from '../generated/facts';
import { MotionProvider } from '../components/motion/MotionProvider';
import { HeadManager } from '../components/chrome/HeadManager';
import { SkipLink } from '../components/chrome/SkipLink';
import { TopBar } from '../components/chrome/TopBar';
import { SectionNav } from '../components/chrome/SectionNav';
import { Footer } from '../components/chrome/Footer';
import { ScrollspyProvider } from '../state/scrollspy';
import { PageProvider, usePage } from '../state/page';
import { hasPendingPlace, measurePlace, placeTop, restorePlace, type Place } from '../state/place';
import { holdPlace, markOwnScroll, scrollTopOf } from '../state/hold';
import { NotFound } from './NotFound';
import { Page } from '../sections/Page';

const WEDDING_START = Date.parse(WEDDING_START_UTC);
/** How long a deep-linked section is held in place while the page above it settles (fonts, lazy images). */
const PIN_MS = 6000;
/** How long a language switch holds the place while the new script's fonts and line counts settle (QA r1 I1). */
const SWITCH_HOLD_MS = 2500;
/** How long an in-page jump (menu, chips, footer) is held on its target while the page below the fold grows. */
const ANCHOR_HOLD_MS = 2500;
/** How long a rotation (or any width change) holds the reading place (QA r1 T6). */
const ROTATE_HOLD_MS = 1500;

const instant = 'instant' as ScrollBehavior;

function jumpTo(id: string) {
  markOwnScroll();
  document.getElementById(id)?.scrollIntoView?.({ block: 'start', behavior: instant });
}

/** Hold a measured place (a switch, a rotation): scroll back to it while the page reflows under it. */
function holdMeasuredPlace(place: Place, ms: number) {
  const off = () => {
    const t = placeTop(place);
    return t !== null && Math.abs(window.scrollY - t) > 1;
  };
  return holdPlace({
    off,
    fix: () => {
      const t = placeTop(place);
      if (t !== null) window.scrollTo({ top: t, left: 0, behavior: instant });
    },
    away: () => {
      const t = placeTop(place);
      return t !== null && Math.abs(window.scrollY - t) > 3;
    },
    ms,
    stopOnForeignScroll: true,
  });
}

/** The section the viewport top is in (for the reading place of a rotation). */
function sectionAtTop(): string | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-section]')) {
    if (el.getBoundingClientRect().bottom > 1) return el.id || null;
  }
  return null;
}

export function LangLayout() {
  const { pathname, search, hash } = useLocation();
  const r = resolvePath(pathname);
  if (r.kind === 'redirect') return <Navigate replace to={{ pathname: r.to, search, hash }} />;
  if (r.kind !== 'page') return <NotFound />;
  return (
    <CopyProvider lang={r.lang}>
      <MotionProvider>
        <PageProvider>
          <Shell />
        </PageProvider>
      </MotionProvider>
    </CopyProvider>
  );
}

function Shell() {
  const { lang, variant } = useI18n();
  const { visible } = usePage();
  const { hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const firstLayout = useRef(true);
  const pinned = useRef<string | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // after a language switch the new copy is on screen: return to the remembered place, instantly, and hold it while
  // the new script's faces swap in and its line counts settle (the page grew 250 px under Venues in WebKit, QA r1 I1)
  useIsomorphicLayoutEffect(() => {
    if (hasPendingPlace()) {
      const place = restorePlace();
      if (place) holdMeasuredPlace(place, SWITCH_HOLD_MS);
      return;
    }
    if (firstLayout.current) {
      firstLayout.current = false;
      // the clock is not known in this first render (the countdown is still in the page): after the wedding start a
      // #countdown link already goes to the celebrations (2.1)
      const live = Date.now() < WEDDING_START;
      const id = resolveSectionHash(hash, live ? visible : visible.filter((s) => s !== 'countdown'));
      if (id && id !== 'opening') {
        jumpTo(id);
        pinned.current = id;
      }
    }
  }, [lang]);

  // a deep link stays on its section while the page above it settles: web fonts, lazy images and the countdown
  // leaving after the clock is known change the heights above it. Re-applied on every size change of the page until
  // the guest (or anything else) scrolls the page, taps or presses a key, or for PIN_MS at most.
  useEffect(() => {
    const id = pinned.current;
    if (!id) return;
    const offset = () => document.getElementById(id)?.getBoundingClientRect().top ?? 0;
    return holdPlace({
      off: () => Math.abs(offset()) > 1,
      fix: () => jumpTo(id),
      away: () => Math.abs(offset()) > 2,
      ms: PIN_MS,
      stopOnForeignScroll: true,
    });
  }, []);

  // an in-page jump (the menu, the chips, "back to top") lands on its target even when the page grows on the way:
  // lazy art or fonts arriving below the fold moved Venues 1000 px down under a menu jump (QA r1 M2). The browser's
  // own (smooth) jump runs; while it lands, every size change of the page re-aims it.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      const raw = a?.getAttribute('href')?.slice(1);
      if (!raw) return;
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        /* keep raw */
      }
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        const smooth = getComputedStyle(document.documentElement).scrollBehavior === 'smooth';
        holdPlace({
          off: () => Math.abs(window.scrollY - scrollTopOf(el)) > 8,
          fix: () => el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : instant }),
          ms: ANCHOR_HOLD_MS,
        });
      });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // a rotation (or any width change) keeps the reading place: Safari has no scroll anchoring, and a phone turned at
  // Venues landed 1500 px away in another section (QA r1 T6). The place is measured when the scroll rests, and put
  // back two frames after the width changes (then held while the new layout settles).
  useEffect(() => {
    let saved: Place | null = null;
    let width = window.innerWidth;
    let resizedAt = -Infinity;
    let timer = 0;
    const measure = () => {
      if (performance.now() - resizedAt < 800) return;
      const id = sectionAtTop();
      saved = id ? measurePlace(id) : null;
    };
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 160);
    };
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      resizedAt = performance.now();
      const place = saved;
      if (!place) return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const t = placeTop(place);
          if (t === null) return;
          markOwnScroll();
          window.scrollTo({ top: t, left: 0, behavior: instant });
          holdMeasuredPlace(place, ROTATE_HOLD_MS);
        }),
      );
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <ScrollspyProvider version={`${lang}:${variant.key}:${visible.length}`}>
      <HeadManager />
      <SkipLink />
      <TopBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} menuButtonRef={menuButton} />
      <SectionNav open={menuOpen} onClose={closeMenu} returnFocus={menuButton} />
      <main id="main">
        <Page />
      </main>
      <Footer />
    </ScrollspyProvider>
  );
}
