// <BrushEdge> (spec 3.5): while a plate section is entering before its paint-reveal, its top edge is a ragged
// dry-brush edge (textures/brush-edge.webp, a repeat-x alpha strip) in the previous section's ground, laid over the
// bottom of the previous painting, so the boundary reads as one canvas being painted on. Render it as a direct child
// of the section (outside the frame: it overhangs the section's top). It shows only while the section's paint-reveal
// is pending (data-paint="pending", set by <PaintReveal>), fades out as the brush starts, and is gone for good after:
// a pinned frame never shows an edge, and nothing shows without JS or under reduced motion. It fades in only once the
// section has started to enter (its top above 97% of the viewport, `data-edge`), so a section waiting just below the
// fold never lays its edge over the first screen (the opening's frame stays whole until the guest scrolls).
import { useEffect, useRef, type CSSProperties } from 'react';
import edgeUrl from '../../assets/textures/brush-edge.webp';

export function BrushEdge() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const section = ref.current?.parentElement;
    if (!section || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) section.toggleAttribute('data-edge', e.isIntersecting);
      },
      { rootMargin: '0px 0px -3% 0px', threshold: 0 },
    );
    io.observe(section);
    return () => {
      io.disconnect();
      section.removeAttribute('data-edge');
    };
  }, []);
  return (
    <div
      ref={ref}
      className="brush-edge"
      aria-hidden="true"
      style={{ '--edge': `url("${edgeUrl}")` } as CSSProperties}
    />
  );
}
