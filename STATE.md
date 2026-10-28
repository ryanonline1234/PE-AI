# STATE.md — where PE.AI is right now

_Updated 2026-10-28. Overwrite in place at every handoff._

## Status
Live in production (`main` @ 4c0f9e7, PR #9 merged 2026-10-28; PR #8 and #7
before it): mandatory Mitty Google sign-in for everyone, no teacher keys,
student /me home with up to 3 personal classes, /c/CODE workout page (records
class membership), /classes/CODE owner page with roster, name-free AI prompts.
Ryan's Mitty student account is `admin`. Every class has an owner.

**Open: PR #10 (`sessions`), dated sessions + a calorie estimate**
(`docs/02-sessions.md`, DECISIONS 2026-10-28). Teacher classes get one session
per school date with its own settings; students get today's session or the
class defaults. The min-calorie target is gone; the AI estimates, and old
summaries lose their calorie-target sentences. Migration
`20261028000008_class_sessions` is already applied to production (additive;
`main` ignores it). Verified by Claude: tsc/lint/build, date assertions, the
calorie filter, four real Haiku 5.5 generations on the new prompt builder,
schema constraints and RLS read from the catalog. NOT verified: signed-in
screens (Ryan, on the PR's Vercel preview).

The UI revamp is parked on branch `ui-revamp` (classic UI frozen as tag
`ui-classic-v1` + branch `ui-classic`) until Ryan's green light.

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

## Next action
1. Ryan tests PR #10 on its Vercel preview (steps in the PR body), then merges
   on his OK. After the merge, re-run one signed-out production check.
2. Then PR B (docs/02 §5): teacher sport consult + allowlisted research that
   writes a brief onto a session. Confirm web-search pricing and model support
   first. PR C (student sport brief, progression memory) needs its own
   DECISIONS entry first, because it stores new minors' data.
3. Ask the PE teacher / Mitty tech office whether student sign-in needs a
   school data agreement (open recommendation from 2026-10-27).
4. UI revamp resumes only on Ryan's green light (branch `ui-revamp`).
5. Real-phone check of Go mode and the question flow.
