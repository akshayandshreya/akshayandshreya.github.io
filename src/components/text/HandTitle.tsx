// <HandTitle>: a hand-lettered title (spec 3.4) that is brushed on: a dry-brush wipe (textures/brush-wipe.webp, opaque
// left, bristly leading edge) slides across it over --t-title with an opacity ramp; then it is still. Gold-leaf titles
// (`gold`) shimmer afterwards on the half phrase (motion.css). The heading level and classes are the caller's.
import { useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';
import wipeUrl from '../../assets/textures/brush-wipe.webp';
import { MOTION } from '../../lib/motion';
import { useEntrance } from '../motion/MotionProvider';

export interface HandTitleProps {
  as?: ElementType;
  className?: string;
  /** ms after the section's trigger */
  at?: number;
  /** ms (spec: --t-title, 900) */
  dur?: number;
  /** gold leaf (shimmers once per half phrase in the full tier) */
  gold?: boolean;
  id?: string;
  children: ReactNode;
  style?: CSSProperties;
  [attr: string]: unknown;
}

export function HandTitle({
  as: Tag = 'h2',
  className = '',
  at = 0,
  dur = MOTION.tTitle,
  gold = false,
  children,
  style,
  ...rest
}: HandTitleProps) {
  const ref = useRef<HTMLElement>(null);
  useEntrance(ref, { at, dur, kind: 'title' });
  const vars = { '--wipe': `url("${wipeUrl}")`, ...style } as CSSProperties;
  return (
    <Tag
      ref={ref}
      className={`hand-title${gold ? ' gold-leaf' : ''} ${className}`.trim()}
      data-enter="title"
      style={vars}
      {...rest}
    >
      {children}
    </Tag>
  );
}
