# 04 — UI improvement ideas

> **Status 2026-10-29:** Ryan kept S1, S2, S3, S6, T1, T2, T3, T4, the
> unsaved-edits warning (T5 without toasts), one icon set, real dialogs and
> fewer all-caps headings, all built (PRs #15–#18, DECISIONS 2026-10-29). The
> rest was dropped as not worthwhile: S4, S5, S7, T6, T7, toasts, the
> empty-state and accessibility passes.

_2026-10-28. Ryan asked for UI ideas on both sides to make PE.AI feel more
professional and easier to use. Grounded in the current screens (reference
shots on branch `ui-revamp`, docs/ui-classic) and this week's features.
Nothing here is decided; ★ = recommended first. Effort: S (hours), M (a day),
L (several days). The full visual revamp (5 PE-native directions) stays parked._

## What the screens show today

- **The workout is one very long scroll.** At phone width the workout page is
  about 6,400 px tall; the Start button sits below seven exercise cards.
- **Go mode counts sets, not exercises.** "Step 1 / 46" for a 26-minute
  workout feels endless, and there's no peek at what's next.
- **Students retype the same form every time** (fitness, injuries,
  preferences), even when nothing changed since yesterday.
- **Teachers can't see today at a glance:** who has done today's workout, how
  it's rated, and what's planned all live on different tabs.
- **Polish gaps that read as "student project":** emoji as icons (⚡ 💪 🔥 👀),
  browser `confirm()` popups, inline success boxes that push content down,
  inconsistent button styles between pages.

## Student side

| # | Idea | Why | Effort |
|---|---|---|---|
| S1 ★ | **Compact workout + sticky Start bar.** Exercises as tight rows (name, sets × reps, rest) that expand for the tip and how-to; a bottom bar with ▶ Start always visible; Share/Print in a ⋯ menu. | Cuts the scroll by more than half; the main action is always one tap away. | M |
| S2 ★ | **Go mode by exercise.** "Exercise 3 of 7 · Set 2 of 3", a progress bar split into warm-up / main / cool-down, and a "Next up" line under the timer. | Progress feels real; students know what to set up next. | S |
| S3 ★ | **"Same as last time" start.** Remember fitness level and preferences on the device and offer one tap to reuse them. Injuries are never stored on our side; at most a device-only "Still have that ankle thing?" reminder. | Removes the most repeated typing; keeps health data off the server. | S |
| S4 | **Finish screen that closes the loop.** After Go mode: time, est. kcal, one-tap stars, optional comment, then "Your week: 3 workouts, 78 min". | Ratings get submitted more often; a little motivation. | M |
| S5 | **Student home as "today".** Each joined class shows today's session name and a big Start button; below, this week's workouts. | Fewer taps from opening the app to moving. | M |
| S6 | **Watch-how links on exercises.** A "Watch a demo" button per exercise (YouTube search, already in `ui.tsx`), with the numbered how-to steps beside it. | Form questions answered without asking the teacher. | S |
| S7 | **Add-to-home-screen tip** for iPhone and iPad, shown once. | Makes the PWA feel like an app; faster daily start. | S |

## Teacher side

| # | Idea | Why | Effort |
|---|---|---|---|
| T1 ★ | **Today panel** at the top of a class: today's session, a roster checklist of who has and hasn't generated today's workout, today's average rating, and the report button. | The one screen a teacher needs during a period. | M |
| T2 ★ | **Projector mode + QR code** for the class code: a full-screen code with a QR students scan to open `/c/CODE`. | Gyms have projectors; nobody mistypes a code. | S |
| T3 ★ | **New-class setup in three steps:** name → settings (start from a preset) → background (AI asks) → share code. | The "smoother creation" goal; a first-time teacher can't get lost. | M |
| T4 | **Week view for sessions.** A Mon–Fri grid per class (and across classes): copy a day to other days or periods, "repeat weekly". | Planning a week takes minutes, not a page per day. | L |
| T5 | **Unsaved-changes guard + toasts.** Warn before leaving a tab or page with unsaved edits; show "Saved" as a toast instead of an inline box. | Fewer lost edits; the page doesn't jump. | S |
| T6 | **Student detail drawer** from the roster: their recent workouts, ratings and comments, with a flag for repeated "too hard". | Lets a teacher spot a struggling student. | M |
| T7 | **Printable workout cards** for a session (one sample per page, big type) for students without phones. | Covers the no-phone student. | S |

## Shared polish (professional feel)

- ★ **One icon set** (for example Lucide, line icons at one stroke weight) in
  place of emoji; same icon for the same action everywhere. (S)
- ★ **Real dialogs** instead of browser `confirm()` for delete / apply-to-all;
  same button order and wording everywhere. (S)
- **Fewer all-caps headings** and one type scale for headings, labels and body;
  keep the display font for the big moments (workout title, timer, class code). (S–M)
- **Empty, loading and error states** written for each screen, with the next
  step spelled out. (S)
- **Accessibility pass:** contrast of muted text, 44 px tap targets, visible
  focus rings, reduced-motion support in Go mode. (S–M)

## Recommended first batch

S2, T2, T5 and the two shared ★ items: all small, all visible on day one of
the pilot. Then S1 + T1 as the next PR (the two biggest everyday wins).
