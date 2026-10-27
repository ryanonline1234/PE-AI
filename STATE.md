# STATE.md — where PE.AI is right now

_Updated 2026-10-26. Overwrite in place at every handoff._

## Status
Live in production: Tier A, Tier B, AI-conversation features, privacy/terms.
Branch `teacher-accounts` (PR open, shipping to production on Ryan's request):
Mitty Google sign-in for teachers, /teacher dashboard (classes with labels and
stats, claim an existing class, My workouts with filing), /teacher/[code]
class pages (settings editor, filed workouts, student workouts by day,
ratings, archive). Classic code + teacher key flow on "/" unchanged.

Verified: tsc/lint/build; RLS with a rolled-back SQL test; signed-out
redirects, the Google hand-off (hd=*, PKCE cookie, correct callback), open-
redirect guard, callback errors, 401s on account APIs, classic flow end to end
in the browser. NOT verified: anything signed in (needs a real Google sign-in).

The UI revamp is parked on branch `ui-revamp` (classic UI frozen as tag
`ui-classic-v1` + branch `ui-classic`, reference shots in docs/ui-classic)
until Ryan gives the green light.

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
1. Ryan signs in at pe-ai.vercel.app/login with his Mitty account; Claude sets
   his profile to `admin` (`update profiles set role='admin' where email=…`).
2. Ryan creates a class, previews a sample, files it; checks /teacher.
3. Then flip rec 2: new classes require sign-in (save-class) once real
   sign-ins work; tell the PE teacher to sign in and claim their class.
4. UI revamp resumes only on Ryan's green light (branch `ui-revamp`).
5. Real-phone check of Go mode and the question flow.
