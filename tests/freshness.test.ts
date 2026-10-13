import { describe, it, expect } from 'vitest';
import { evaluateFreshness } from '../src/freshness';
import { greenhouse } from '../src/connectors/greenhouse';
import { lever } from '../src/connectors/lever';
import type { NormalizedJob } from '../src/types';

const now = new Date('2026-10-13T12:00:00Z');
const job = (o: Partial<NormalizedJob>): NormalizedJob => ({
  sourceJobId: '1', company: 'x', title: 't', url: 'u', location: '', description: '',
  publishedAt: new Date('2026-10-13T06:00:00Z'), updatedAt: null,
  timestampType: 'published_datetime', status: 'open', ...o });

describe('strict freshness', () => {
  it('accepts a verified job within 24h', () => expect(evaluateFreshness(job({}), now).fresh).toBe(true));
  it('rejects a job older than 24h', () =>
    expect(evaluateFreshness(job({ publishedAt: new Date('2026-10-12T11:00:00Z') }), now).reason).toBe('stale'));
  it('old job updated today keeps original age', () =>
    expect(evaluateFreshness(job({ publishedAt: new Date('2026-10-01T00:00:00Z'), updatedAt: now }), now).fresh).toBe(false));
  it('updated-only timestamps are unverified', () =>
    expect(evaluateFreshness(job({ timestampType: 'updated_only', publishedAt: null, updatedAt: now }), now).reason).toBe('date_unverified'));
  it('date-only and unknown dates are excluded', () => {
    expect(evaluateFreshness(job({ timestampType: 'published_date_only' }), now).fresh).toBe(false);
    expect(evaluateFreshness(job({ timestampType: 'none', publishedAt: null }), now).fresh).toBe(false);
  });
  it('closed listings are excluded', () => expect(evaluateFreshness(job({ status: 'closed' }), now).fresh).toBe(false));
  it('24h boundary inclusive, 24h+1s excluded', () => {
    expect(evaluateFreshness(job({ publishedAt: new Date('2026-10-12T12:00:00Z') }), now).fresh).toBe(true);
    expect(evaluateFreshness(job({ publishedAt: new Date('2026-10-12T11:59:59Z') }), now).fresh).toBe(false);
  });
  it('honors configurable window', () =>
    expect(evaluateFreshness(job({ publishedAt: new Date('2026-10-12T06:00:00Z') }), now, 48).fresh).toBe(true));
  it('DST-safe (UTC comparison)', () => {
    const n = new Date('2026-11-01T09:30:00Z');
    expect(evaluateFreshness(job({ publishedAt: new Date('2026-10-31T10:00:00Z') }), n).fresh).toBe(true);
  });
  it('rejects future timestamps', () =>
    expect(evaluateFreshness(job({ publishedAt: new Date('2026-10-14T12:00:00Z') }), now).reason).toBe('timestamp_in_future'));
});

const mock = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
describe('connectors', () => {
  it('lever createdAt is a published datetime', async () => {
    const [j] = await lever.fetchJobs('acme', mock([{ id: 'a', text: 'FE', createdAt: Date.parse('2026-10-13T08:00:00Z'), hostedUrl: 'h' }]));
    expect(j.timestampType).toBe('published_datetime');
  });
  it('greenhouse updated_at alone is not publication', async () => {
    const [j] = await greenhouse.fetchJobs('acme', mock({ jobs: [{ id: 1, title: 'BE', updated_at: '2026-10-13T08:00:00Z' }] }));
    expect(j.timestampType).toBe('updated_only'); expect(j.publishedAt).toBeNull();
  });
  it('greenhouse date-only first_published rejected', async () => {
    const [j] = await greenhouse.fetchJobs('acme', mock({ jobs: [{ id: 1, first_published: '2026-10-13' }] }));
    expect(j.publishedAt).toBeNull();
  });
  it('failed/malformed responses throw, never zero jobs', async () => {
    await expect(lever.fetchJobs('x', mock({}, 500))).rejects.toThrow();
    await expect(greenhouse.fetchJobs('x', mock({ nope: 1 }))).rejects.toThrow();
  });
});
