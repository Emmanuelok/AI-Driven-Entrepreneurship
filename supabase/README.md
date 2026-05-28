# Sankofa backend (Supabase)

## What this is

Sankofa runs **local-first**. Every store persists to localStorage and the
platform is fully functional without any backend at all. When Supabase env
vars are configured, the same stores also sync to Postgres for cross-device
access, real-user auth, and per-account AI cost caps.

## Setting it up (10 minutes)

1. **Create a Supabase project** at https://supabase.com/dashboard. Free tier is fine.
2. **Run the migration**. Either:
   - Paste `migrations/0001_initial.sql` into Supabase → SQL editor → Run, OR
   - `supabase db push` if you've installed the [Supabase CLI](https://supabase.com/docs/guides/cli).
3. **Copy your project credentials** from Supabase → Project Settings → API.
4. **Set env vars** in `.env.local` (dev) and Vercel project settings (prod):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        (anon, browser-safe)
   SUPABASE_SERVICE_ROLE_KEY=eyJ...            (server-only, NEVER expose)
   ```
5. **Enable Email auth** in Supabase → Authentication → Providers → Email.
   Magic links work out of the box; turn off "confirm email" if you want
   passwordless sign-in to skip the verification step.
6. Restart the dev server / redeploy. Sankofa auto-detects the env and
   flips on cloud sync — the topbar status indicator turns green.

## Schema overview

| Table | Holds |
| --- | --- |
| `sankofa_main` | Profile, XP, ventures, lessons, badges |
| `sankofa_builds` | AI Build Studio projects + eval suites |
| `sankofa_sketches` | Brainstorm canvases |
| `sankofa_letters` | Letters & writing artifacts |
| `sankofa_ext` | Extension state |
| `sankofa_me` | Genome, memories, activity log |
| `ai_usage` | Append-only log of every Claude call (tokens + cost) |
| `ai_quotas` | Per-user daily/monthly cost caps |
| `sign_in_log` | Audit trail for sign-ins |

Every table has Row-Level Security: a user can read/write only their own
rows. Service-role inserts (used by trusted API routes) bypass RLS.

## What syncs vs what doesn't

- **Syncs**: everything in the six Sankofa stores listed above. Whole-store
  snapshots (last-write-wins, no CRDT). Debounced to ~5s so we're not
  hammering Supabase on every keystroke.
- **Doesn't sync**: AI usage badge (`sankofa-ai-usage-v1`) and language
  preference (`sankofa-lang-v1`) — these stay local on each device.
  AI usage is duplicated server-side in `ai_usage` for billing.

## Running without Supabase

The platform falls back gracefully:
- `supabaseBrowser()` returns `null` → sync layer no-ops
- Auth routes return stubbed success messages
- The topbar status indicator says "Local only"

This is the default state — no backend setup needed for a developer to
clone and run the app.
