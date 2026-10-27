# STATE.md — where PE.AI is right now

_Updated 2026-10-26. Overwrite in place at every handoff._

## Status
Live in production (`main` @ 971653a): Tiers A+B, AI-conversation features,
privacy/terms, teacher accounts with Mitty Google sign-in. Ryan's account
(ryantseng29@mittymonarch.com) is `admin`; production sign-in verified by his
real sign-in on 2026-10-27.

Branch `mandatory-login` (PR open, awaiting Ryan's preview test + merge):
everyone signs in; teacher keys removed (admin assigns old classes from
/teacher); students get /me (join with a code, personal classes, history);
/c/CODE is the workout page; /classes/CODE is the owner page (roster for
teachers, settings + history for personal classes); names never reach the AI.

Verified on the branch: tsc/lint/build; RLS with a rolled-back SQL test
(teacher / member / non-member / key-hash column); every signed-out page and
API path. NOT verified by Claude: any signed-in screen (needs a real Google
sign-in), which is why the PR waits on Ryan's preview test.

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
- Test data: class HMJ8TW has several smoke-test workouts and one 4-star review.

## Next action
1. Ryan tests the `mandatory-login` preview signed in (student home, personal
   class, join a class, teacher dashboard, roster, admin assign) and merges.
2. After merge: assign the pre-account classes to real teachers (admin box on
   /teacher); the PE teacher signs in once first.
3. Ask the PE teacher / Mitty tech office whether student sign-in needs a
   school data agreement (open recommendation from 2026-10-27).
4. UI revamp resumes only on Ryan's green light (branch `ui-revamp`).
5. Real-phone check of Go mode and the question flow.
