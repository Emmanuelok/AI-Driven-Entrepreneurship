-- ─────────────────────────────────────────────────────────────────────────
-- Notification prefs — in-app bell categories.
--
-- The push + email categories shipped in 0019 covered push and email.
-- The in-app notifications table (claps, comments, forks, system
-- events) didn't honor any user pref. Add two booleans:
--   in_app_social → clap / comment / fork on your owned artifact
--   in_app_system → account-level events (default on; rarely off)
-- ─────────────────────────────────────────────────────────────────────────

alter table public.notification_prefs
  add column if not exists in_app_social boolean not null default true;

alter table public.notification_prefs
  add column if not exists in_app_system boolean not null default true;
