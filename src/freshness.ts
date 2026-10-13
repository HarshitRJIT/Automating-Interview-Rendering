import type { NormalizedJob } from './types';
export type Verdict = { fresh: boolean; ageHours: number | null; reason: string };
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Strict rule: only a reliable original publish DATETIME inside the window, on an open listing. */
export function evaluateFreshness(job: NormalizedJob, now: Date, windowHours = 24): Verdict {
  if (job.status !== 'open') return { fresh: false, ageHours: null, reason: 'listing_not_open' };
  if (job.timestampType !== 'published_datetime' || !job.publishedAt || isNaN(job.publishedAt.getTime()))
    return { fresh: false, ageHours: null, reason: 'date_unverified' };
  const diff = now.getTime() - job.publishedAt.getTime();
  if (diff < -CLOCK_SKEW_MS) return { fresh: false, ageHours: null, reason: 'timestamp_in_future' };
  const ageHours = Math.max(0, diff) / 3_600_000;
  return ageHours <= windowHours
    ? { fresh: true, ageHours, reason: 'verified_fresh' }
    : { fresh: false, ageHours, reason: 'stale' };
}
