# STATE.md — where PE.AI is right now

_Updated 2026-10-26. Overwrite in place at every handoff._

## Status
Tier A (revive + harden) is **live in production** at pe-ai.vercel.app
(`main` @ 1e2b529, merged from PR #2 on 2026-10-26). Verified on production:
page + self-hosted fonts, API gate, keepalive auth, teacher-key claim + 403,
generation (12 s). All 16 pre-existing classes are still unclaimed (null key).

## What Tier A changed
- Next 15.2.8 → 16.4.3, React 19.3, Anthropic SDK 1.3, supabase-js 2.118,
  Tailwind 4.3.3; `next/font` fonts; flat ESLint config. Build, lint, tsc clean.
- Teacher key gating `save-class` + `generate-report` (`lib/teacher-key.ts`,
  teacher UI shows it once and remembers it per browser).
- Postgres rate limiter (`rate_limit_check`) on every route, failing open.
- Daily report uses the browser's local day (default America/Los_Angeles).
- `/api/keepalive` + `vercel.json` daily cron; `CRON_SECRET` set on Vercel
  (production + preview) and in `.env.local`.
- Supabase: migrations `baseline`, `teacher_key`, `rate_limits` applied to
  project `btdfzxcrbmcynpnrhzzz` and tracked in `supabase/migrations/`.
- Vercel: stale `DEEPSEEK_API_KEY` removed; service-role + internal secret
  switched to sensitive type.

## Next action
1. Confirm the keep-alive cron fired (Vercel → pe-ai → Cron Jobs, first run
   12:00 UTC 2026-10-27) and that `rate_limits` is filling sanely after the
   teacher's first real class.
2. Tier B (gym-floor): streaming generation + Haiku 5.5 measurement, persisted
   workouts with a share link, "Go" mode with timers + wake lock, PWA.
3. Tier C: review history across days, per-day generation counts, whole-class
   workout mode.

## Known gaps / not verified
- Rate-limit thresholds are a first guess; watch `rate_limits` after the first
  real class (per-IP is the risky one: a school shares one NAT IP).
- Supabase free-tier pause policy is recalled, not verified; the cron is cheap
  insurance either way.
- Vercel Hobby cron runs daily at best-effort timing; fine for keep-alive.
