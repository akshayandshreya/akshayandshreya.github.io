// A clock that is null on the server and on the first client render (so hydration never mismatches, risk R6), then
// ticks on exact unit boundaries (setTimeout to the next minute, not an interval) and pauses while the tab is hidden.
import { useEffect, useState } from 'react';
import { msToNextBoundary } from '../lib/countdown';

export function useNow(unitMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (!document.hidden) timer = window.setTimeout(tick, msToNextBoundary(t, unitMs));
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) tick();
    };
    tick();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [unitMs]);
  return now;
}
