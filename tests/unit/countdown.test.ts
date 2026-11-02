import { describe, expect, it } from 'vitest';
import { msToNextBoundary, remaining } from '../../src/lib/countdown';
import { WEDDING_START_UTC } from '../../src/generated/facts';

describe('countdown (A-CD-1)', () => {
  it('counts down to 2026-11-26T12:30:00Z', () => {
    const now = Date.parse('2026-11-02T10:00:00Z');
    const r = remaining(WEDDING_START_UTC, now);
    expect(r).toMatchObject({ done: false, days: 24, hours: 2, minutes: 30 });
  });
  it('is the same instant whatever the device zone says (the inputs are absolute)', () => {
    // 18:00 IST on the wedding day = 12:30Z: exactly zero remaining
    const ist = Date.parse('2026-11-26T18:00:00+05:30');
    const la = Date.parse('2026-11-26T04:30:00-08:00');
    expect(remaining(WEDDING_START_UTC, ist).done).toBe(true);
    expect(remaining(WEDDING_START_UTC, la).done).toBe(true);
    expect(remaining(WEDDING_START_UTC, ist - 60_000)).toMatchObject({ done: false, days: 0, hours: 0, minutes: 1 });
  });
  it('is done (and never negative) after the start', () => {
    const r = remaining(WEDDING_START_UTC, Date.parse('2026-12-01T00:00:00Z'));
    expect(r).toMatchObject({ done: true, days: 0, hours: 0, minutes: 0, totalMs: 0 });
  });
  it('schedules updates on minute boundaries', () => {
    expect(msToNextBoundary(Date.parse('2026-11-02T10:00:59.250Z'))).toBe(750);
    expect(msToNextBoundary(Date.parse('2026-11-02T10:01:00.000Z'))).toBe(60_000);
  });
});
