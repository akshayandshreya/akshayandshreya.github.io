export const NBSP: string;
export const WJ: string;
export function keep(
  str: string,
  lang: 'en' | 'hi' | 'mai' | 'bn',
  names?: { name: string; honorific?: string | null }[],
): string;
export function joinHyphens(str: string): string;
export function bindUnits(str: string, lang: 'en' | 'hi' | 'mai' | 'bn'): string;
export function hygiene(
  str: string,
  lang: 'en' | 'hi' | 'mai' | 'bn',
  names?: { name: string; honorific?: string | null }[],
): string;
export function plain(str: string): string;
export function graphemeLength(str: string): number;
export function splitAddress(str: string): [string, string];
export function splitFirst(str: string, sep: string): [string, string | null];
