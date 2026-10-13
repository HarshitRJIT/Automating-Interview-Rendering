import type { Connector, NormalizedJob } from '../types';
// Greenhouse Job Board API. `first_published` is the original publish time; `updated_at` is NOT.
const HAS_TIME = /T\d{2}:\d{2}/;
export const greenhouse: Connector = {
  id: 'greenhouse',
  async fetchJobs(board, f = fetch) {
    const r = await f(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
    if (!r.ok) throw new Error(`greenhouse HTTP ${r.status}`);
    const data: any = await r.json();
    if (!data || !Array.isArray(data.jobs)) throw new Error('greenhouse: malformed response');
    return data.jobs.map((j: any): NormalizedJob => {
      const fp = typeof j.first_published === 'string' && HAS_TIME.test(j.first_published) ? new Date(j.first_published) : null;
      const valid = fp && !isNaN(fp.getTime());
      const up = j.updated_at ? new Date(j.updated_at) : null;
      return {
        sourceJobId: String(j.id), company: board, title: String(j.title ?? ''),
        url: String(j.absolute_url ?? ''), location: String(j.location?.name ?? ''),
        description: String(j.content ?? ''),
        publishedAt: valid ? fp : null, updatedAt: up && !isNaN(up.getTime()) ? up : null,
        timestampType: valid ? 'published_datetime' : j.updated_at ? 'updated_only' : 'none', status: 'open',
      };
    });
  },
};
