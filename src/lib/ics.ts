// "Add to calendar" as a client-side .ics file (spec 2.3.4, A-EV-5): RFC 5545 text, CRLF line ends, TEXT escaping and
// lines folded at 75 octets on UTF-8 code point boundaries (Devanagari and Bengali take 3 bytes per code point, so a
// fold never splits a sequence). No DTEND unless a duration is configured (no end times exist: a point-in-time event,
// RFC 5545 3.6.1, open question O3). SUMMARY and DESCRIPTION are in the page language; LOCATION is the English map line.
import type { EventCopy } from '../i18n/types';

export const ICS_PRODID = '-//Akshay & Shreya//Wedding//EN';
export const ICS_UID_DOMAIN = 'akshay-shreya.wedding';

export interface IcsOptions {
  /** "Akshay & Shreya" in the page language and variant order (SUMMARY suffix). */
  pair: string;
  /** Minutes after the start for DTEND; null/absent = no DTEND. */
  durationMinutes?: number | null;
  /** The page URL (DESCRIPTION line and URL property); null/absent when the site URL is not configured. */
  url?: string | null;
  /** Alias of `url`. */
  siteUrl?: string | null;
  /** DTSTAMP (epoch ms or Date); defaults to now. */
  now?: number | Date;
}

/** The page URL of the options (`url`, or its alias `siteUrl`). */
export function pageUrlOf(o: { url?: string | null; siteUrl?: string | null }): string | null {
  return o.url ?? o.siteUrl ?? null;
}

/** The end instant when a duration is configured, else null (point-in-time event). */
export function endUtc(startUtc: string, durationMinutes: number | null | undefined): Date | null {
  return durationMinutes != null && durationMinutes > 0
    ? new Date(Date.parse(startUtc) + durationMinutes * 60_000)
    : null;
}

/** Hygiene characters out (word joiners, no-break spaces): calendars show them as boxes or odd gaps. */
export function plainCopy(s: string): string {
  return s
    .replace(/[\u2060\u200b\ufeff]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** RFC 5545 3.3.11 TEXT escaping. */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();
const octets = (s: string) => encoder.encode(s).length;

/** Fold one content line at 75 octets without splitting a UTF-8 sequence; continuation lines start with a space. */
export function foldLine(line: string): string {
  if (octets(line) <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = octets(ch);
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // the leading space of a continuation line is one of its 75 octets
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** 2026-11-25T05:30:00Z -> 20261125T053000Z */
export function icsUtc(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function eventUid(e: Pick<EventCopy, 'key' | 'dateIso'>): string {
  return `${e.key}-${e.dateIso.replace(/-/g, '')}@${ICS_UID_DOMAIN}`;
}

export function eventSummary(e: Pick<EventCopy, 'title'>, pair: string): string {
  return `${plainCopy(e.title)} · ${plainCopy(pair)}`;
}

export function eventDescription(e: Pick<EventCopy, 'venue' | 'address'>, url: string | null | undefined): string {
  const where = `${plainCopy(e.venue)}, ${plainCopy(e.address.join(' '))}`;
  return url ? `${where}\n${url}` : where;
}

function vevent(e: EventCopy, o: IcsOptions, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${eventUid(e)}`, `DTSTAMP:${stamp}`, `DTSTART:${icsUtc(e.startUtc)}`];
  const end = endUtc(e.startUtc, o.durationMinutes);
  if (end) lines.push(`DTEND:${icsUtc(end)}`);
  lines.push(
    `SUMMARY:${escapeText(eventSummary(e, o.pair))}`,
    `LOCATION:${escapeText(plainCopy(e.mapQuery))}`,
    `DESCRIPTION:${escapeText(eventDescription(e, pageUrlOf(o)))}`,
  );
  const url = pageUrlOf(o);
  if (url) lines.push(`URL:${url}`);
  lines.push('END:VEVENT');
  return lines;
}

/** One VCALENDAR with a VEVENT per event, CRLF line ends, folded. */
export function buildIcs(events: readonly EventCopy[], o: IcsOptions): string {
  const stamp = icsUtc(new Date(o.now ?? Date.now()));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap((e) => vevent(e, o, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** akshay-shreya-<event>.ics for one event, akshay-shreya-celebrations.ics for several (or none given). */
export function icsFileName(events?: readonly Pick<EventCopy, 'key'>[] | EventCopy['key']): string {
  const one = typeof events === 'string' ? events : events?.length === 1 ? events[0]?.key : undefined;
  return one ? `akshay-shreya-${one}.ics` : 'akshay-shreya-celebrations.ics';
}

/** Hand the file to the browser (a Blob URL, revoked after the click): no request leaves the device. */
export function downloadIcs(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
