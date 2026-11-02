// ?side=groom|bride and ?reception=1|0 (spec 2.1, 2.5), on top of the variant path (/{lang}/b/, /k/, /bk/). Invalid
// values fall back to the path's variant (else the defaults).
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { VariantKey } from '../i18n/types';
import { resolvePath } from '../lib/langs';

export type Side = 'groom' | 'bride';

export interface Variant {
  side: Side;
  reception: boolean;
  key: VariantKey;
  /** the variant the path names (`/{lang}/b/`), kept by the language switch; null on `/{lang}/` */
  path: VariantKey | null;
}

const TRUE = new Set(['1', 'true', 'yes', 'on']);
const FALSE = new Set(['0', 'false', 'no', 'off']);

export function parseSide(params: URLSearchParams, fallback: Side = 'groom'): Side {
  const side = params.get('side')?.trim().toLowerCase();
  if (side === 'groom' || side === 'g') return 'groom';
  if (side === 'bride' || side === 'b') return 'bride';
  const order = params.get('order')?.trim().toUpperCase(); // the engine's order=G|B
  if (order === 'B') return 'bride';
  if (order === 'G') return 'groom';
  return fallback;
}

export function parseReception(params: URLSearchParams, fallback = true): boolean {
  const r = params.get('reception')?.trim().toLowerCase();
  if (r && FALSE.has(r)) return false;
  if (r && TRUE.has(r)) return true;
  return fallback;
}

export function variantKey(side: Side, reception: boolean): VariantKey {
  return `${side === 'groom' ? 'G' : 'B'}${reception ? '1' : '0'}` as VariantKey;
}

/** The variant of a URL: the path's variant (`/{lang}/b/` ..., spec 2.1) sets the defaults, the query wins. */
export function parseVariant(search: string, pathVariant: VariantKey | null = null): Variant {
  const params = new URLSearchParams(search);
  const base = pathVariant ?? 'G1';
  const side = parseSide(params, base.startsWith('B') ? 'bride' : 'groom');
  const reception = parseReception(params, base.endsWith('1'));
  return { side, reception, key: variantKey(side, reception), path: pathVariant };
}

/** The variant of the current URL (read once per navigation). */
export function useVariant(): Variant {
  const { pathname, search } = useLocation();
  const r = resolvePath(pathname);
  const pathVariant = r.kind === 'page' ? r.variant : null;
  return useMemo(() => parseVariant(search, pathVariant), [search, pathVariant]);
}
