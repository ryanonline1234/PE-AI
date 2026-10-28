# 02 — Dated sessions and the calorie estimate (design)

_Status: approved by Ryan 2026-10-28 ("go with recs"); PR A builds §2–§4.
§5 (planning helpers) is the roadmap for PR B and PR C and is not built._

## 1. Goal

A PE class doesn't do the same thing every day. Monday is cardio for 30
minutes, Wednesday is strength with dumbbells for 45. Until now a class had
one set of settings, so the teacher had to edit the class before every
period. And the teacher set a minimum calorie target, which made the AI pad
workouts to hit a number nobody can measure.

After this change:

- a teacher plans **sessions**: one date, its own settings, its own AI check;
- students get the session for today, or the class's **default settings** on
  a day with no session;
- nobody sets a calorie target. The AI estimates what the workout burns and
  the workout shows it as an estimate.

## 2. Calories

- Gone: the "Min Calories to Burn" slider, the `minCalories` config key, the
  "150+ kcal" line on the student screen, the generation rule "burn at least
  N kcal", and the AI check's question about unrealistic calorie targets.
- The model still writes `totalCalories` and a per-exercise `calories` (the
  JSON Lines format is unchanged; `reconcileTotals` still uses the
  per-exercise numbers to sanity-check the total). The prompt now says there
  is no target: estimate honestly for a typical high school student, don't
  inflate, and ignore any calorie target an older saved summary mentions.
- Display: total only, as "≈ 180" labeled "Est. kcal" on the workout and
  "≈ 180 kcal (estimate)" on the Go mode finish screen. The per-exercise kcal
  line is dropped: it looked precise and isn't.
- Stored configs that still carry `minCalories` are left alone. The key is
  ignored on read and dropped by `clampConfig` on the next save. Stripping it
  in SQL before this ships would break production's prompt.

## 3. Sessions

### Model

- A session belongs to one teacher class and one date (`YYYY-MM-DD`, the
  school's calendar day in America/Los_Angeles). At most one per class per
  date. It has a name ("Volleyball conditioning", optional) and a full
  `ClassConfig`: duration, intensity, focus, equipment, custom instructions,
  and its own AI-check summary and clarifications.
- The class's own config becomes its **default settings**: what new sessions
  copy from, and what students get on a day with no session. Existing classes
  keep their settings as defaults; nothing migrates.
- Personal classes (a student's own) don't get sessions in v1. They keep one
  set of settings.

### Which settings a workout uses

Resolved on the server for every generation, never taken from the browser:

1. A regeneration uses the session of the workout it edits (or the defaults,
   if that workout had none), so a change request mid-period doesn't switch
   settings under the student.
2. The owner's sample preview from a session's page uses that session.
3. Otherwise: the session for today's school date in that class, else the
   defaults.

Every saved workout records its `session_id` (null = defaults).

### Teacher UI

- `/classes/CODE`: a **Sessions** section above the settings. It shows
  today's session or "No session today: students get the default settings",
  the upcoming sessions, and the last two weeks of past ones. **+ Plan a
  session** takes a date (defaulting to the next day without one) and what
  to copy from: the defaults or an earlier session. The settings editor below
  is retitled **Default settings**.
- `/classes/CODE/s/YYYY-MM-DD`: one session. Name, the same settings editor,
  AI check and sample preview as the class page, and Delete. Today's report
  stays on the class page.
- Workout lists on the class page label each day with its session's name.

### Student UI

`/c/CODE` shows today's session in the header: "Period 3 · Volleyball
conditioning · 30 min · moderate intensity". No calorie line.

### Data

- New table `class_sessions` (`id`, `class_id` → `pe_classes` on delete
  cascade, `session_date date`, `name`, `config jsonb`, timestamps;
  unique `(class_id, session_date)`). RLS: the class owner reads, the same
  shape as `class_workouts`. Writes go through `/api/class-sessions` with
  the service role after an owner check, with `clampConfig` on every config.
- `workouts.session_id` → `class_sessions` on delete set null. Deleting a
  session keeps its workouts; they just lose the label.
- Additive DDL only (migration `20261028000008_class_sessions`).

## 4. Verification plan

- `tsc`, lint, build.
- Assertions for the date logic (school date across Pacific midnight and the
  UTC rollover at 5 pm).
- A rolled-back SQL test of the table: unique per class and date, cascade on
  class delete, set-null on workouts, owner-only RLS.
- One real generation with the new prompt (Haiku 5.5): no calorie-target
  line, a plausible estimate.
- Signed-in screens: Ryan checks them on the Vercel preview. Claude can't
  sign in with Google.

## 5. Roadmap: planning helpers (PR B, PR C; not built)

Planning help writes a short **brief** onto a session; every workout that
day follows it. The help runs once at setup time on a bigger model, and the
result is short text, so per-student generation stays Haiku with no tools and
the first item still lands in 2–4 s.

- **PR B, teacher.**
  - *Sport consult*: the AI asks a few tap questions (sport or unit, season
    phase, goals, what to emphasize or avoid) using the existing AI-check
    rounds, then writes a 3–5 line brief onto the session.
  - *Research with sources*: the teacher types a topic; Sonnet 5.5 searches
    an allowlist only (NSCA, ACSM, NIH/PubMed, CDC, NATA, AAP) and returns
    3–5 findings, each with a one-line takeaway and a link. The teacher pins
    the ones to keep; pinned takeaways join the brief. Confirm web-search
    pricing and model support against the docs before building.
- **PR C, student.**
  - *"My sport" brief*: the same consult for a student, saved to their
    account and used in every class under the teacher's settings (teacher
    wins). No health details are stored: injuries stay in the per-workout box.
    This is a new kind of stored minors' data and gets its own DECISIONS
    entry first.
  - *Progression memory*: the AI sees the student's last 2–3 workouts and
    ratings in the class.
- **Later ideas**: "why this exercise" lines tied to the brief and its
  sources; a week planner that drafts a unit's sessions with progression;
  equipment and space presets with counts; a reviewed library of sport
  briefs.
