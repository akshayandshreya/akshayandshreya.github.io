import { useEffect, useLayoutEffect } from 'react';

/** useLayoutEffect in the browser, useEffect on the server (no SSR warning; the effect only matters on the client). */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
