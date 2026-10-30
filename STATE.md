# STATE.md — where PE.AI is right now

_Updated 2026-10-28. Overwrite in place at every handoff._

## Status
Live in production (`main` @ 99c20d5, PR #10 merged 2026-10-28; PR #9, #8,
#7 before it): mandatory Mitty Google sign-in for everyone, no teacher keys,
student /me home with up to 3 personal classes, /c/CODE workout page (records
class membership), /classes/CODE owner page with roster, name-free AI prompts.
Ryan's Mitty student account is `admin`. Every class has an owner.

**Dated sessions + a calorie estimate are live** (PR #10, `docs/02-sessions.md`,
DECISIONS 2026-10-28). Teacher classes get one session per school date with
its own settings; students get today's session or the class defaults. The
min-calorie target is gone; the AI estimates, and old summaries lose their
calorie-target sentences. Verified by Claude: tsc/lint/build, date
assertions, the calorie filter, four real Haiku 5.5 generations on the prompt
builder, schema constraints and RLS from the catalog, and signed out in
production after the merge (pages redirect to /login with the right `next`,
including /classes/CODE/s/DATE; /api/class-sessions 401s; a bogus route 404s).
Ryan's preview test planned no session (`class_sessions` had 0 inserts;
previews share the production Supabase project), so Claude ran an
end-to-end test on 2026-10-28: the REAL route handlers (`/api/classes`,
`save-class`, `class-sessions`, `generate-workout`) loaded through jiti against
the production DB and Haiku 5.5, with only `@/lib/teacher-auth` aliased to a
stub caller (Ryan's admin id). **34/34 passed**: plan / duplicate 409 /
past + impossible dates 400 / non-owner 403 / signed-out 401 / copy defaults /
copy another session / clamping / a fresh workout uses today's session (15-min
stretch day vs 45-min strength defaults) / regenerations keep their workout's
session / owner sample uses the page's session / delete keeps workouts and
falls back to defaults / personal classes refused. Both test classes were
deleted afterwards (sessions + workouts cascade); class count back to 10.
NOT covered: rendering the signed-in pages (Sessions list, session page,
student header). Claude can't sign in; Ryan's eyes on production cover it.

**Planning help is live** (PR #11 merged 2026-10-28, prod @ ec35126; signed-out
checks passed, new APIs 401, privacy page updated): sport consult → brief,
trusted-site research with pinnable findings, students' "My sport" briefs.

**Teachers' own workouts + equipment chips are live** (PR #12, prod @ ac7c939).
Not yet exercised by a real sign-in (no teacher "Just me" space existed after
Ryan's preview test).

**AI background + session specifics + tabs are live** (PR #13 merged
2026-10-29, prod @ b506aed; signed-out checks passed). After Ryan's preview
test no class had a saved background and no session had specifics, so those
saves haven't been exercised signed in yet (the harness covered them, 15/15).

**Open: PR #14 (`presets`)**, now based on main: named setting presets, copied
in; apply in Settings, start a class/session from one, or apply to all
classes. Table `setting_presets` (migration 20261028000010, applied). Harness
16/16 (Ryan's own classes snapshotted and restored exactly), checked at
1280/375. Also carries docs/04-ui-ideas.md (UI brainstorm).
NOT verified by Claude: the signed-in pages (Ryan).

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
1. Ryan tests PR #14 on its preview (save a preset, start a class from it,
   apply a test preset to all classes), then merges. Also save one class
   background and one session's specifics so those paths run signed in.
2. Ryan makes one own workout in production (/teacher → ⚡ Make a workout for
   myself) so the "Just me" path is exercised signed in.
3. UI improvement brainstorm (2026-10-28) → Ryan picks what to build.
4. Ask the PE teacher / Mitty tech office about a school data agreement
   (open since 2026-10-27).
5. Real-phone check of Go mode and the question flow.
