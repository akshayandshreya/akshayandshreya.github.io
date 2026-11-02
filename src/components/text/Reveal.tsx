// <Reveal>: an entrance on the section's content timeline (spec 3.4). Text enters once (opacity + blur + a feathered
// left-to-right wipe) and is then still: no drift, scale or parallax on text, ever. `at` is the offset after the
// section's trigger (lib/motion ENTRANCE has the spec's table), `dur` its length. Other kinds: 'fade' (opacity only:
// particles, actions), 'feather' (the couple: a soft mask rising from the feet, no movement), 'rise' (a painted motif:
// a feathered reveal from its foot). The resting state is the base CSS; JS adds the pre-entrance state only when the
// entrance will run (motion.css, MotionProvider useEntrance).
import { useMemo, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { MOTION } from '../../lib/motion';
import { useEntrance, type EntranceKind } from '../motion/MotionProvider';

export interface RevealProps {
  as?: ElementType;
  className?: string;
  /** ms after the section's trigger */
  at?: number;
  /** ms */
  dur?: number;
  /** @deprecated use `at` */
  delay?: number;
  kind?: Exclude<EntranceKind, 'draw' | 'title'>;
  /** animate the single child element itself (a component's root, a grid item) instead of a wrapper: renders a
   *  `display: contents` span and plays the entrance on its first element child */
  wrap?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  id?: string;
  lang?: string;
  [attr: string]: unknown;
}

export function Reveal({
  as: Tag = 'div',
  className,
  at,
  dur = MOTION.tText,
  delay,
  kind = 'text',
  wrap = false,
  children,
  style,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const target = useMemo(
    () => ({
      get current(): HTMLElement | null {
        const el = ref.current;
        return wrap ? ((el?.firstElementChild as HTMLElement | null) ?? null) : el;
      },
    }),
    [wrap],
  );
  useEntrance(target, { at: at ?? delay ?? 0, dur, kind });
  if (wrap)
    return (
      <span ref={ref} className="reveal-wrap" data-enter-wrap={kind} style={{ display: 'contents' }}>
        {children}
      </span>
    );
  return (
    <Tag ref={ref} className={className} data-enter={kind} style={style} {...rest}>
      {children}
    </Tag>
  );
}
