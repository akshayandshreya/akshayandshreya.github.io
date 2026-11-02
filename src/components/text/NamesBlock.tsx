// The couple's names (spec 2.3.1, 2.3.2, 2.3.8), always in the variant's order (side=groom: Akshay first; side=bride:
// Shreya first) with the gold joiner ("&", or "ও" in bn):
//   variant="pair"  the short pair in one line (opening, footer), `pair` role
//   variant="full"  the invitation: each honorific directly above its own name, then the joiner, then the second
//                   person; names never break inside (A-INV-3)
import { useI18n } from '../../i18n/context';
import type { Person } from '../../i18n/types';
import { Joiner } from './Joiner';
import { Reveal } from './Reveal';
import styles from './NamesBlock.module.css';

export function NamesBlock({
  variant,
  className = '',
  delay = 0,
}: {
  variant: 'pair' | 'full';
  className?: string;
  /** Entrance offset of the first name (3.4: invitation name 1 at 600 ms, joiner +700, name 2 +850). */
  delay?: number;
}) {
  const { copy } = useI18n();
  if (variant === 'pair') {
    const { first, joiner, second } = copy.pair;
    return (
      <p className={`names-block names-block--pair t-pair ${styles.pair} ${className}`}>
        <span className={styles.name}>{first}</span> <Joiner value={joiner} />{' '}
        <span className={styles.name}>{second}</span>
      </p>
    );
  }
  const { first, second, joiner } = copy.names;
  return (
    <div className={`names-block names-block--full ${styles.full} ${className}`}>
      <PersonLine person={first} delay={delay} />
      <Reveal className={styles.joinerRow} delay={delay + 700}>
        <Joiner value={joiner} className={styles.joiner} />
      </Reveal>
      <PersonLine person={second} delay={delay + 850} />
    </div>
  );
}

function PersonLine({ person, delay }: { person: Person; delay: number }) {
  return (
    <Reveal as="p" className={styles.person} data-role={person.role} delay={delay}>
      {person.honorific && <span className={`t-honor ${styles.honor}`}>{person.honorific}</span>}
      <span className={`t-names ${styles.name}`}>{person.text}</span>
    </Reveal>
  );
}
