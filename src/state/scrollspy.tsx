// Scrollspy (spec 2.1.2): the section covering the viewport's 40% line, from an IntersectionObserver over every
// [data-section] element. With config.syncHashOnScroll the hash follows the scroll through history.replaceState (at most
// once per 400 ms, only on change; #opening is written as no hash). replaceState keeps history.state, so the router's
// own entry bookkeeping is untouched.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { config } from '../config';

const SpyContext = createContext<string>('opening');

/** Section ids in DOM order. */
export function sectionElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
}

export function ScrollspyProvider({ children, version }: { children: ReactNode; version: string }) {
  const [active, setActive] = useState('opening');
  const lastWrite = useRef(0);
  const userScrolled = useRef(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = sectionElements();
    // the section covering the 40% line, read from the layout whenever the line crosses a section edge (the observer
    // only says that something crossed; reading every section's box here, in the observer callback, also settles a
    // batch that reports the section left and the one reached in any order, and a layout shift above the line)
    const pick = () => {
      const line = (window.innerHeight || document.documentElement.clientHeight) * 0.4;
      let id: string | undefined;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.top <= line && r.bottom > line) id = el.dataset.section;
      }
      if (id) setActive(id);
    };
    const io = new IntersectionObserver(pick, { rootMargin: '-40% 0px -60% 0px', threshold: 0 });
    window.addEventListener('resize', pick, { passive: true });
    for (const el of els) io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener('resize', pick);
    };
  }, [version]);

  useEffect(() => {
    const mark = () => {
      userScrolled.current = true;
    };
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('keydown', mark);
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
      window.removeEventListener('keydown', mark);
    };
  }, []);

  useEffect(() => {
    if (!config.syncHashOnScroll || !userScrolled.current) return;
    const write = () => {
      const want = active === 'opening' ? '' : `#${active}`;
      if (window.location.hash === want) return;
      const url = `${window.location.pathname}${window.location.search}${want}`;
      window.history.replaceState(window.history.state, '', url);
      lastWrite.current = Date.now();
    };
    const wait = Math.max(0, 400 - (Date.now() - lastWrite.current));
    const t = window.setTimeout(write, wait);
    return () => window.clearTimeout(t);
  }, [active]);

  return <SpyContext.Provider value={active}>{children}</SpyContext.Provider>;
}

/** The id of the section in view. */
export function useActiveSection(): string {
  return useContext(SpyContext);
}
