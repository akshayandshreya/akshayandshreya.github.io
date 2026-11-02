// The monogram (AS / SA) in its gold ring (spec 1.4, 2.3.1). Latin in every language.
import type { SiteCopy } from '../../i18n/types';

export function Monogram({ value, size = 'l' }: { value: SiteCopy['monogram']; size?: 's' | 'l' }) {
  return (
    <span className={`monogram monogram--${size}`} aria-hidden="true">
      <svg className="monogram__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <path d="M 50 94 A 44 44 0 1 1 55.4 6.3" />
        <path d="M 50 94 A 44 44 0 1 0 44.6 6.3" />
        <circle className="monogram__bindu" cx="50" cy="6" r="2.4" />
      </svg>
      <span className="monogram__text gold-leaf" lang="en">
        {value}
      </span>
    </span>
  );
}
