// "Open in Maps" (spec 2.3.4): Google Maps search with the English map line of the venue (identical in all variants).
export function mapsUrl(mapQuery: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;
}
