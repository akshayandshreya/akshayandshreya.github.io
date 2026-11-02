// The opening dateline (spec 2.3.1): the dates on one line and the cities on the next, in the `dateline` role
// ("25, 26 & 29 November" / "Kolkata · Saharsa"; with reception=0 "25–26 November" / "Kolkata"). Always two lines
// when there are cities; it never shrinks below the role minimum (A-OPEN-5).
import type { SiteCopy } from '../../i18n/types';
import styles from './Dateline.module.css';

export function Dateline({ value, className = '' }: { value: SiteCopy['dateline']; className?: string }) {
  return (
    <p className={`dateline t-dateline ${styles.dateline} ${className}`}>
      <span className={styles.line}>{value.dates}</span>
      {value.cities && (
        <>
          <span className="sr-only">, </span>
          <span className={styles.line}>{value.cities}</span>
        </>
      )}
    </p>
  );
}
