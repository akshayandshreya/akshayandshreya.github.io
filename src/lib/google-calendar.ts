// "Google Calendar" link (spec 2.3.4, A-EV-6): a prefilled event template, opened only on click. Times are UTC
// (the trailing Z), shown by Google in the venue's zone (ctz). Without a configured duration the event is a point in
// time: dates=<start>/<start> (open question O3).
import type { EventCopy } from '../i18n/types';
import { endUtc, eventDescription, eventSummary, icsUtc, pageUrlOf, plainCopy } from './ics';

export const GOOGLE_CALENDAR_BASE = 'https://calendar.google.com/calendar/render';

export function googleCalendarUrl(
  e: EventCopy,
  o: { pair: string; durationMinutes?: number | null; url?: string | null; siteUrl?: string | null },
): string {
  const start = icsUtc(e.startUtc);
  const endAt = endUtc(e.startUtc, o.durationMinutes);
  const end = endAt ? icsUtc(endAt) : start;
  const q = [
    ['action', 'TEMPLATE'],
    ['text', eventSummary(e, o.pair)],
    ['dates', `${start}/${end}`],
    ['details', eventDescription(e, pageUrlOf(o))],
    ['location', plainCopy(e.mapQuery)],
    ['ctz', 'Asia/Kolkata'],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v ?? '')}`)
    .join('&');
  return `${GOOGLE_CALENDAR_BASE}?${q}`;
}
