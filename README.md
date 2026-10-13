# Personal AI Job Search, Matching & Application Preparation Platform

A private, single-owner web app that discovers **verified-fresh** software engineering jobs from official ATS APIs and company feeds, filters and ranks them against your editable preferences and approved resume profile, helps you prepare applications, and tracks everything in a database mirrored to Google Sheets.

> **It never submits applications for you.** "Applied" is only recorded when you explicitly confirm it.

---

## Build status (be honest about what works)

| Stage | Scope | Status |
|---|---|---|
| 1 | Scaffolding, auth, database, dashboard | Schema + env template written. App code not yet built |
| 2 | Settings, source registry, normalized job schema | Schema written. UI/API not yet built |
| 3 | Greenhouse / Lever connectors, strict freshness | Not started |
| 4 | Dedup, filtering, search, scheduler | Not started |
| 5 | Resume upload, extraction review, matching | Not started |
| 6 | Preparation queue and tracker | Not started |
| 7 | Google Sheets sync | Not started |
| 8 | Notifications, logs, recovery, health checks | Not started |
| 9 | Tests and security review | Not started |
| 10 | Production deployment | Not started |

Nothing here is deployed and no integration is connected. The app will show each integration's real setup status and will never display fake counts or fake success.

---

## Tech stack

- **Frontend/Backend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Database/Auth/Storage:** Supabase (PostgreSQL, Auth, private Storage bucket, Row-Level Security)
- **Queue/Scheduler:** Postgres-backed job queue (`pg_cron` + a worker route) or Inngest/Trigger.dev
- **AI:** Provider-agnostic interface (default: Anthropic API); used for resume extraction, semantic matching, and drafting
- **Google:** Sheets API v4 via OAuth (server-side only)
- **Hosting:** Vercel (or any Node host) with HTTPS

---

## Repository layout (planned)

```
/app                 Next.js routes (15 pages listed below)
/app/api             Server endpoints (auth-guarded)
/lib/connectors      greenhouse.ts, lever.ts, rss.ts, ... (common interface)
/lib/freshness       Strict freshness evaluator
/lib/matching        Rule engine + semantic scoring
/lib/sheets          Idempotent Google Sheets sync
/lib/queue           Job queue, retries, idempotency keys
/lib/security        SSRF guard, rate limiting, validators
/supabase/migrations SQL migrations (001_core_schema.sql included)
/tests               Unit + integration tests with fixtures
/docs                Connector, Google OAuth, backup guides
```

### Pages
Dashboard · Discover Jobs · Recommended for Me · Saved Jobs · Preparation Queue · Application Tracker · Resume Library · Skills & Candidate Profile · Search & Filter Settings · Company & Source Management · Automation & Scheduling · Google Sheets · Notifications · Activity Logs · Security & Account

---

## The strict freshness rule

A job appears in **Fresh Jobs** only if **all** are true:

1. `source_published_at` is a reliable **original publication timestamp with a time component**
2. It is within the configured window (default **24 hours**, editable)
3. The listing was verified **open** at the latest check

Never treated as publication dates: `updated_at`, `first_seen_at`, date-only values. Jobs failing verification go to the separate **Date Unverified** review section and are never mixed into Fresh results. Old jobs edited today keep their original age. Timestamps are stored in UTC.

Note: many sources (e.g. some Greenhouse boards) expose only an *updated* time, not an original publish time. Those jobs will be classified as unverified. This is correct behavior, not a bug.

---

## Setup

### 1. Prerequisites
- Node.js 20+
- A Supabase project (free tier is sufficient to start)
- A Vercel account (or other Node host)
- Optional: Anthropic (or other LLM) API key; Google Cloud project for Sheets

### 2. Install
```bash
git clone <your-private-repo>
cd job-search-platform
npm install
cp .env.example .env.local   # fill in values
```

### 3. Database
```bash
npx supabase link --project-ref <ref>
npx supabase db push          # applies supabase/migrations/*.sql
```
Create a **private** Storage bucket named `resumes` (no public access).

### 4. Create the owner account
Create your single user in Supabase Auth, then set `OWNER_USER_ID` in the environment. Disable public sign-ups in Supabase Auth settings.

### 5. Run
```bash
npm run dev
```

### 6. Google Sheets (when ready)
1. Create a Google Cloud project and enable the **Google Sheets API**.
2. Configure the OAuth consent screen (External, add yourself as a test user).
3. Create an OAuth client (Web). Redirect URI: `https://<your-domain>/api/google/callback`
4. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. In the app: **Google Sheets > Connect**, then choose or create a spreadsheet.

Sheet column ownership: the app owns all columns in the four generated worksheets. Manual edits to app-owned columns are overwritten on the next sync; add your own columns to the right of the last app column to keep them. The database is the source of truth.

### 7. Deploy
1. Push the repo to GitHub (private).
2. Import into Vercel, add all variables from `.env.example`.
3. Add a scheduled call (Vercel Cron or `pg_cron`) hitting `/api/cron/discover` every hour with the `CRON_SECRET` header.
4. Confirm `/api/health` returns OK.

---

## Security model

- Single owner; every API route checks the session server-side
- RLS enabled on all tables; policies restrict rows to `OWNER_USER_ID`
- Resumes in a private bucket, accessed only via short-lived signed URLs
- Secrets only in server environment variables
- SSRF protection: allowlisted source types, HTTPS only, private/loopback IPs blocked, redirects re-validated
- Resumes and job descriptions are treated as untrusted data; instructions inside them are never followed
- Logs exclude resume text and secrets
- Respects robots.txt, rate limits, and ETag/Last-Modified; no CAPTCHA or auth bypass

---

## Cost expectations (verify current pricing before enabling)

- Supabase and Vercel: free tiers likely cover one user at small scale
- LLM usage: pay-per-token; limited to resume extraction, matching, and drafts. Caching keeps this low
- Google Sheets API: free within quota

---

## Testing

Planned suites cover: freshness boundaries (incl. DST), updated-vs-published dates, dedup vs distinct requisitions, closed listings, hard-eligibility filters, score recalculation, status transitions, no auto-submission, Sheets idempotency and retry, scheduler restart, authorization and file access, malformed source responses. External services are mocked; no live success is faked.

```bash
npm test
```

---

## Backup and recovery

- Enable Supabase daily backups (paid plan) or run `pg_dump` on a schedule to private storage
- Use the in-app **Export my data** (JSON/CSV) regularly
- Restore: apply migrations to a fresh project, then import the dump
- Resumes: back up the `resumes` bucket separately

---

## Known limitations

- Original publish times are often unavailable, so many jobs will land in Date Unverified
- Large employers on Workday/Taleo/SuccessFactors often have no documented public API; they are marked **unsupported** with a link to the careers page
- LinkedIn, Naukri, and Indeed prohibit scraping; they are not supported unless you have a permitted API
- Semantic matching quality depends on the LLM provider

---

## Roadmap

Follow the stage table above, stopping after each stage to test before moving on.
