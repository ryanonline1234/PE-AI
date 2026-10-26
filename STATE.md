# STATE.md — where PE.AI is right now

_Updated 2026-10-26. Overwrite in place at every handoff._

## Status
Tier A (revive + harden) is on branch `revive` (commit 793d6f4, pushed) with a
Vercel preview at https://pe-ai-git-revive-ryanonline1234s-projects.vercel.app
(behind Vercel Authentication: log in to vercel.com to view). Verified on the
preview: page + self-hosted fonts, get-class, keepalive auth, generation (15 s).
Not yet merged. Production (`pe-ai.vercel.app`, `main` @ ce10ca6) is the June 4
build and still works.

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
1. Ryan reviews the preview, tries the teacher flow (create → save → key shown →
   reload on a fresh browser → key required), then merges the PR.
2. Merge `revive` → `main` (deploys production). The 16 existing classes have
   no key; whoever saves one next claims it — all 16 are Ryan's test classes.
3. Then Tier B (gym-floor): streaming generation + Haiku 5.5 measurement,
   persisted workouts with a share link, "Go" mode with timers + wake lock, PWA.

## Known gaps / not verified
- Rate-limit thresholds are a first guess; watch `rate_limits` after the first
  real class (per-IP is the risky one: a school shares one NAT IP).
- Supabase free-tier pause policy is recalled, not verified; the cron is cheap
  insurance either way.
- Vercel Hobby cron runs daily at best-effort timing; fine for keep-alive.
