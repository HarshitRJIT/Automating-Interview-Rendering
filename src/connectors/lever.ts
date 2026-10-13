import type { Connector, NormalizedJob } from '../types';
// Lever Postings API: createdAt is epoch ms of original posting creation.
export const lever: Connector = {
  id: 'lever',
  async fetchJobs(site, f = fetch) {
    const r = await f(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`);
    if (!r.ok) throw new Error(`lever HTTP ${r.status}`);
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error('lever: malformed response');
    return data.map((p: any): NormalizedJob => {
      const ok = typeof p.createdAt === 'number' && p.createdAt > 0;
      return {
        sourceJobId: String(p.id), company: site, title: String(p.text ?? ''),
        url: String(p.hostedUrl ?? ''), location: String(p.categories?.location ?? ''),
        description: String(p.descriptionPlain ?? ''),
        publishedAt: ok ? new Date(p.createdAt) : null, updatedAt: null,
        timestampType: ok ? 'published_datetime' : 'none', status: 'open',
      };
    });
  },
};
