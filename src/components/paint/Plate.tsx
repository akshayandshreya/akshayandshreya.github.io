// <Plate>: a section's pre-rendered painting (spec 1.3, 5.3, 5.5, 6.6) as one <picture>: AVIF then WebP for each frame
// shape (tall phones, mid tablets, wide desktops), the wide 1920 WebP as the <img>, `sizes` = the covered width.
// The markup is the `.plate` layer of the sticky frame (layout.css: cover-fit on --focal, 4% oversize for the idle
// drift of 3.6); the LQIP is the frame's own background (lqipVars on the section). The opening plate is the LCP
// element: eager + fetchpriority high. Every other plate is lazy. Decorative (alt="").
import { platePicture, plateLayer, plateLayerSize, type PictureSource } from '../../lib/plates';

/** fetchpriority is not in React 18's prop types; lower-case attributes pass through to the DOM as-is. */
const HIGH_PRIORITY = { fetchpriority: 'high' } as Record<string, string>;
/** The lazy paintings below the opening never compete with the first screen on a slow link (QA r1 T3). */
const LOW_PRIORITY = { fetchpriority: 'low' } as Record<string, string>;

export function Sources({ sources }: { sources: PictureSource[] }) {
  return (
    <>
      {sources.map((s) => (
        <source key={`${s.type} ${s.media ?? 'all'}`} type={s.type} media={s.media} srcSet={s.srcSet} sizes={s.sizes} />
      ))}
    </>
  );
}

export function Plate({ id, eager = false, className = '' }: { id: string; eager?: boolean; className?: string }) {
  const pic = platePicture(id);
  if (!pic) return null;
  return (
    <picture className={`plate ${className}`.trim()} data-plate={id}>
      <Sources sources={pic.sources} />
      <img
        src={pic.img.src}
        width={pic.img.width}
        height={pic.img.height}
        alt=""
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        draggable={false}
        {...(eager ? HIGH_PRIORITY : LOW_PRIORITY)}
      />
    </picture>
  );
}

/** A transparent layer on the base's pixel grid (gold leaf, or the veil of 3.6): one WebP per frame shape. */
export function PlateLayer({
  id,
  layer,
  eager = false,
  className = '',
}: {
  id: string;
  layer: 'gold' | 'veil';
  eager?: boolean;
  className?: string;
}) {
  const l = plateLayer(id, layer);
  if (!l) return null;
  // the layer's pixel size (the wide file's; every frame shape keeps the plate's grid), so the box is known before the
  // file arrives (QA r1 T10)
  const size = plateLayerSize(id, layer);
  return (
    <picture className={`${layer} ${className}`.trim()} data-plate={id}>
      <Sources sources={l.sources} />
      <img
        src={l.img.src}
        width={size?.width}
        height={size?.height}
        alt=""
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        draggable={false}
        {...(eager ? HIGH_PRIORITY : LOW_PRIORITY)}
      />
    </picture>
  );
}
