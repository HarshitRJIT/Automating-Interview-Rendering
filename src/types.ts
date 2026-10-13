export type TimestampType = 'published_datetime' | 'published_date_only' | 'updated_only' | 'none';
export interface NormalizedJob {
  sourceJobId: string; company: string; title: string; url: string; location: string;
  description: string; publishedAt: Date | null; updatedAt: Date | null;
  timestampType: TimestampType; status: 'open' | 'closed' | 'unknown';
}
export interface Connector {
  id: string;
  fetchJobs(board: string, fetchImpl?: typeof fetch): Promise<NormalizedJob[]>;
}
