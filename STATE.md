# STATE.md — where PE.AI is right now

_Updated 2026-10-26. Overwrite in place at every handoff._

## Status
Tier A, Tier B, and the AI-conversation features are **live in production**
at pe-ai.vercel.app (`main` @ edda0b5, PR #4 merged 2026-10-26). Verified on
production after the deploy: teacher AI check answers, a vague injury makes
the student flow ask first, regeneration opens with a note that also shows on
the saved page.

Teacher accounts with Mitty Google sign-in are designed in
`docs/01-teacher-accounts.md` and **not built**; they wait on Ryan's
decisions (§7 there) and his Google Cloud + Supabase dashboard steps (§4).

## What Tier B changed
- **Haiku 5.5, streamed.** `generate-workout` asks for JSON Lines and forwards
  each item as NDJSON; the browser renders progressively. Measured locally:
  first item 2–4 s, complete 8–10 s (was a 12–16 s spinner). Thinking disabled.
- **Persisted workouts + share link.** New table `workouts` (migration
  `20261027000004_workouts`, applied to `btdfzxcrbmcynpnrhzzz`). After a
  generation the URL becomes `/w/<id>`; that page is server-rendered from the
  table and offers Go mode, share, print, review, and "Make my own" back to the
  class (`/?code=XXXXXX` auto-joins).
- **Go mode** (`components/GoMode.tsx`, steps built by `lib/go-mode.ts`):
  full-screen step player, countdowns for timed work and rest, tap-to-finish
  rep sets, pause, back, chime + vibration, screen wake lock, finish screen
  that lands on the review card.
- **PWA**: `app/manifest.ts`, icons in `public/icons/` (rendered from Barlow
  Condensed by a scratch PIL script), `public/sw.js` (cache hashed assets,
  network-first pages), registered in production only.
- **Refactor**: UI primitives moved to `components/ui.tsx`, workout view to
  `components/WorkoutScreen.tsx`; `app/page.tsx` shrank from 984 to ~640 lines.

## Verified locally (dev server against the live API + DB)
tsc / lint / build clean; lib assertions for the stream parser and step
builder; NDJSON stream via curl (progressive); browser at 375px: streaming
render, URL rewrite, Go mode (timed, reps, rest), reload of `/w/<id>`,
auto-join from the share page, review submit from the share page; manifest
and sw.js served; 404 for bad ids.

## Not verified yet
- Real phone: install to home screen, wake lock, vibration/chime, share sheet.
- Keep-alive cron first run (12:00 UTC 2026-10-27).
- Test data: class HMJ8TW has several smoke-test workouts and one 4-star review.

## Next action
1. Ryan answers the five decisions in `docs/01-teacher-accounts.md` §7 and
   does the dashboard steps in §4; then Claude builds teacher accounts.
2. Ryan tries Go mode and the question flow on a real phone (wake lock, chime, share sheet, install).
3. Tier C: review history, per-day counts, whole-class mode (fold into the
   teacher dashboard once accounts exist).
