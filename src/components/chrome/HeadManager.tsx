import { useEffect } from 'react';
import { config } from '../../config';
import { useI18n } from '../../i18n/context';
import { applyHead, ensureFonts, headData } from '../../lib/head';

/**
 * Keeps <html lang>, <title>, description, robots, og:* and the language's @font-face rules in step with the language
 * and variant on screen (spec 4.6, 6.2, 6.6). The pre-rendered page already carries all of it for its G1 copy, so on a
 * hydrated first load this changes nothing.
 */
export function HeadManager() {
  const { file, variant } = useI18n();
  useEffect(() => {
    applyHead(headData(file, variant.key, config));
    void ensureFonts(file.lang);
  }, [file, variant.key]);
  return null;
}
