// Countdown math (spec 2.3.3): whole days, hours, minutes (and seconds) to a UTC instant. Time-zone independent
// because both sides are absolute instants.

export interface Remaining {
  done: boolean;
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function remaining(targetUtc: string | number, now: number): Remaining {
  const target = typeof targetUtc === 'number' ? targetUtc : Date.parse(targetUtc);
  const totalMs = Math.max(0, target - now);
  const s = Math.floor(totalMs / 1000);
  return {
    done: target <= now,
    totalMs,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/** Milliseconds until the next whole minute (or second) boundary, so updates land exactly on it. */
export function msToNextBoundary(now: number, unitMs = 60_000): number {
  const r = unitMs - (now % unitMs);
  return r === 0 ? unitMs : r;
}
