# DECISIONS.md — append-only

Older decisions (Mar–Jun 2026) live in the archived merge docs at
`~/Archive/peai-unified/MEMORY.md`. This file starts at the revival.

## 2026-10-26 — Revive for a teacher pilot, not the FitTrack merge
The PE teacher may trial the app again. Ryan likes the existing look and the
no-login flow. Decision: harden and modernize the standalone app; keep the
PE.AI + FitTrack merge (auth, logging, adaptive generation) parked. Revisit only
if the teacher asks for progress tracking after the pilot.

## 2026-10-26 — Repo moves to `~/pe-ai`, work on branch `revive`
Moved out of `~/Archive/peai-unified/PE_AI`. Fittrack and the merge docs stay
archived. `main` is Vercel's production branch, so all work goes on branches
and Ryan merges. Local branches `phase-0` / `provider-deepseek` are kept only
because their tags (`backup/*`) already preserve them and forced deletion is
hook-blocked.

## 2026-10-26 — Next 16, Anthropic SDK 1.x, Supabase JS 2.118
Upgraded from Next 15.2.8 (critical image-optimizer advisory; the app has no
`next/image` use, but it was the modernization anyway). No code changes were
needed beyond: `css.d.ts` shim deleted (Next 16 ships the CSS module types),
`next lint` → `eslint .` with a flat `eslint.config.mjs`, fonts moved from a
Google `<link>` to `next/font` (self-hosted, no runtime request). TypeScript
stays on 6.x; 7.x is the native-port generation and Next's support for it is
unverified.

## 2026-10-26 — Teacher key instead of accounts
Students know the class code by design, so the code can't gate edits. Added a
per-class teacher key (8 chars, `XXXX-XXXX`, SHA-256 hash stored in
`pe_classes.teacher_key_hash`), issued server-side on first save, shown once,
remembered in the teacher's browser (`localStorage`). Required for
`save-class` and `generate-report`. Rejected alternatives: magic-link auth
(collects minors' emails, needs school sign-off), no protection (any student
could rewrite the class).

## 2026-10-26 — Rate limiting in Postgres, failing open
The `x-internal-secret` ships in the browser bundle, so it only stops casual
curl. Real abuse control is `rate_limit_check()` (fixed windows, one RPC per
request, buckets per class code / per IP / global). Per-IP limits stay generous
because a whole school shares one NAT IP. If the limiter errors we allow the
request: blocking a class over a limiter outage is the worse failure.
Limits: generation 150/class/hour, 100/IP/10min, 1500/day global.

## 2026-10-26 — Reports use the school's local day
The daily report filtered reviews by the UTC day; after 5pm Pacific that is
"tomorrow". The browser now sends its IANA time zone; the server computes local
midnight (`lib/time.ts`), defaulting to America/Los_Angeles.

## 2026-10-26 — Daily keep-alive cron
Supabase free tier pauses idle projects (it was paused before this revival).
`vercel.json` schedules `GET /api/keepalive` daily at 12:00 UTC; the route
checks `CRON_SECRET` and does one cheap read. Alternative was Supabase Pro.

## 2026-10-26 — Schema is tracked as migrations from now on
The live schema had been applied by hand. Recorded it as an idempotent
`baseline` migration, then `teacher_key` and `rate_limits`, all via the
Supabase MCP so the project's migration history matches `supabase/migrations/`.

## 2026-10-26 — Model id uses the alias `claude-haiku-4-5`
Same model as the dated `claude-haiku-4-5-20251001`. Moving to Haiku 5.5 plus
streaming is a Tier B change, to be measured against the current ~16 s.
