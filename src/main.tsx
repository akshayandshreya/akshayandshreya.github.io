// Client entry (spec 2.5, 6.6). Each pre-rendered page holds one variant of its language (data-variant): hydrate when
// the URL asks for exactly that, otherwise render from scratch (createRoot replaces the markup), so hydration never
// mismatches. The language chunk is loaded before the first render (the prerender modulepreloads it).
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ROUTER_FUTURE, routerBasename } from './config';
import { loadLang } from './i18n';
import { resolvePath } from './lib/langs';
import { parseVariant } from './state/variant';

/** Resolves just after the next frame is painted (rAF, then a task); a hidden tab, where rAF waits, gets 100 ms. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(() => setTimeout(go, 0));
    setTimeout(go, 100);
  });
}

async function start() {
  const container = document.getElementById('root');
  if (!container) return;
  const base = routerBasename() ?? '';
  const path = window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) || '/' : '/';
  const r = resolvePath(path);
  if (r.kind === 'page') {
    try {
      await loadLang(r.lang);
    } catch (err) {
      console.error('language chunk failed to load', err);
    }
  }
  const app = (
    <StrictMode>
      <BrowserRouter basename={routerBasename()} future={ROUTER_FUTURE}>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
  // the pre-rendered page is one language and one variant (/{lang}/ G1, /{lang}/b/ B1, ...): hydrate only when the URL
  // (path and query) asks for exactly that page
  const prerendered = container.dataset.prerendered;
  const prerenderedVariant = container.dataset.variant ?? 'G1';
  const canHydrate =
    r.kind === 'page' &&
    prerendered === r.lang &&
    parseVariant(window.location.search, r.variant).key === prerenderedVariant;
  if (canHydrate) {
    // the markup is already the right page: let the browser paint it before hydration takes the main thread (on a
    // repeat visit the cached bundle would otherwise run before the first paint and hold back FCP/LCP, spec 6.7)
    await afterPaint();
    hydrateRoot(container, app);
  }
  // another variant (or no prerendered markup): render from scratch. The pre-rendered page stays on screen until React's
  // first commit replaces it in one go (createRoot clears the container at that commit), so there is no blank frame.
  else createRoot(container).render(app);
}

void start();
