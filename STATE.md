# STATE.md — where PE.AI is right now

_Updated 2026-10-29. Overwrite in place at every handoff._

## Status
Live in production (pe-ai.vercel.app, `main`). Everyone signs in with a Mitty
Google account. Students: /me, /c/CODE, personal classes, sport brief.
Teachers: classes with dated sessions, AI background + session specifics,
optional trusted-site research, presets, own workouts. Ryan's Mitty student
account is `admin`.

**How changes ship now (2026-10-29):** Ryan doesn't open previews. Claude tests
each PR itself and merges it, then checks production signed out. The tests are:
- tsc, lint and build;
- the stubbed-auth route harness for API changes;
- a local signed-in dev rig (a scratchpad copy of the app with `supabase-auth`
  and `teacher-auth` stubbed to the admin profile) at 375 and 1280px;
- an independent review subagent on bigger PRs.

The rig and harness live in the session scratchpad, never in the repo. Their
pattern is in DECISIONS.

## Merged today (2026-10-29), all live and checked signed out
- #13 AI background on the class, session specifics, research optional, tabs.
- #14 named setting presets (copied in, apply to all classes).
- #15 one icon set (lucide-react), real dialogs, sentence-case headings.
- #16 student UI: compact workout page with a Start bar, Go mode by exercise,
  same as last time (device-only), demo links.
- #17 teacher UI: Today panel, projector + QR, three-step setup, unsaved warning.
- #18 week view: Mon–Fri grid, copy a session to days/weeks/classes, this week
  across classes (copy route: harness 13/13).
An independent review read #16 and #17/#18 before merge. Its real findings
were fixed first. They included a "Leave without saving?" dialog that was
invisible in a hidden tab yet blocked the page, and past-day copies failing.
ZZ test classes were deleted afterwards.

## Not verified by Claude
- Real devices: wake lock, chime, share sheet, add to home screen, the fixed
  bottom bar with the iOS keyboard up, projector QR scanned by a phone.
- Signed-in production pages (Claude can't sign in; the rig renders the same code).

## Known limits (by design or deferred)
- The browser Back button and in-code navigations (e.g. "+ Plan" in the form,
  Archive) don't trigger the unsaved-edits warning.
- A copied session carries its AI-check summary to other classes (same settings).

## Next action
1. Ryan looks at production: /teacher (New class, This week), a class page
   (Today panel, Projector, Sessions week grid), a student workout + Go mode.
2. Ask the PE teacher / Mitty tech office about a school data agreement
   (open since 2026-10-27).

The full visual revamp stays parked on branch `ui-revamp` (classic UI frozen
as tag `ui-classic-v1`) until Ryan's green light.
