// <GoldLayer>: the plate's gold (spec 1.3, 1.4): transparent gold-leaf flecks and gilded swirl lines on the same pixel
// grid as the base, already erased inside every calm zone (no fleck beside a date). It sits in the same box as
// <Plate> (layout.css `.gold`, same cover math) and moves with it (3.6). Decorative.
import { PlateLayer } from './Plate';

export function GoldLayer({ id, eager = false, className = '' }: { id: string; eager?: boolean; className?: string }) {
  return <PlateLayer id={id} layer="gold" eager={eager} className={className} />;
}
