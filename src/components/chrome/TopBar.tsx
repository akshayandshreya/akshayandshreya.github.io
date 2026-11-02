// The top bar (spec 2.3.8): monogram (link to #opening), the language switch and the menu button. Transparent over
// the opening, paper glass after it; its ink follows the section in view (data-tone); on phones it hides on scroll down
// after the invitation and returns on scroll up (transform only). The theme-color meta follows the section in view
// (its paper, or the mid ground on the deep Wedding/Reception plates), so the phone's browser bar matches the painting.
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/context';
import { useActiveSection } from '../../state/scrollspy';
import { isOwnScroll } from '../../state/hold';
import { Monogram } from '../text/Monogram';
import { LanguageSwitch } from './LanguageSwitch';
import styles from './TopBar.module.css';

const DEEP = new Set(['wedding', 'reception']);
const TOP_SECTIONS = new Set(['opening', 'invitation']);

export function TopBar({
  menuOpen,
  onMenu,
  menuButtonRef,
}: {
  menuOpen: boolean;
  onMenu: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement>;
}) {
  const { copy, t, lang } = useI18n();
  const active = useActiveSection();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  // a language switch lands the guest where they were: the bar (and the switch in it) stays in view (QA r1 I3)
  useEffect(() => {
    lastY.current = window.scrollY;
    setHidden(false);
  }, [lang]);

  useEffect(() => {
    const phone = window.matchMedia?.('(max-width: 767px)');
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        // the site's own jumps (a restore after a switch, a hold) are not the guest scrolling down
        if (isOwnScroll()) {
          lastY.current = y;
          return;
        }
        const down = y > lastY.current + 4;
        const up = y < lastY.current - 4;
        if (down || up) lastY.current = y;
        if (!phone?.matches) setHidden(false);
        else if (down) setHidden(true);
        else if (up) setHidden(false);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const [tone, setTone] = useState<'light' | 'deep'>('light');
  const [deepInk, setDeepInk] = useState<string | null>(null);
  useEffect(() => {
    const el = document.getElementById(active);
    const deep = el?.dataset.tone ? el.dataset.tone === 'deep' : DEEP.has(active);
    setTone(deep ? 'deep' : 'light');
    if (!el) return;
    const cs = getComputedStyle(el);
    // the deep glass takes the section's own deepest ground (vermilion wine, evening teal)
    setDeepInk(deep ? cs.getPropertyValue('--ground-3').trim() || null : null);
    const color = cs.getPropertyValue(deep ? '--ground-2' : '--paper').trim();
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (color && meta && meta.content !== color) meta.content = color;
  }, [active]);

  const solid = active !== 'opening';
  const canHide = !TOP_SECTIONS.has(active) && !menuOpen;

  return (
    <header
      // keyboard focus inside the bar brings it back (WCAG 2.4.7 / 2.4.11, QA r1 T4); CSS :focus-within shows it at once
      onFocus={() => setHidden(false)}
      className={styles.bar}
      data-solid={solid || undefined}
      data-tone={tone}
      style={deepInk ? ({ '--bar-deep': deepInk } as React.CSSProperties) : undefined}
      data-hidden={(hidden && canHide) || undefined}
    >
      <div className={styles.inner}>
        <a className={styles.home} href="#opening" aria-label={copy.pair.text}>
          <Monogram value={copy.monogram} size="s" />
        </a>
        <div className={styles.right}>
          <LanguageSwitch />
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menu}
            aria-expanded={menuOpen}
            aria-controls="section-nav"
            aria-label={t('nav.menu')}
            onClick={onMenu}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 8.5 C 9 7.6, 15 7.6, 20 8.5" />
              <path d="M6 15.5 C 10 14.8, 14 14.8, 18 15.5" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
