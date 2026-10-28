# 03 — Planning help: sport consult, research with sources, "My sport" (design)

_Status: Ryan said go ahead on 2026-10-28 with ideas 1–3 from the
docs/02 §5 brainstorm. Built on branch `planning-help`._

## 1. Goal

Workouts get better when the AI knows what a day is *for*. A teacher running a
volleyball unit wants approach jumps and shoulder care, not a generic circuit;
a student who runs cross-country wants different work than one who plays
lineman. This adds three ways to tell the AI, all written once at setup time
and kept in mind on every workout:

1. **Sport consult → brief (teacher).** The AI asks a few tap questions and
   writes a 3–5 line brief onto a session (or the class defaults).
2. **Research with sources (teacher).** The AI searches a short list of
   trusted sites and returns findings with links; the teacher pins the ones
   that should shape the workouts.
3. **"My sport" brief (student).** The same consult for a student, saved to
   their account and used in every class, under the teacher's settings.

Per-student generation does not change shape: still Haiku 5.5, no tools, the
same JSON Lines stream. The briefs are short text in the prompt.

## 2. Sport consult (teacher and student)

- `POST /api/consult` with `{ for: "session" | "student", topic, answers, round, config? }`
  returns `{ brief, questions }`, the same round shape as the AI check
  (`/api/clarify-class`): up to 3 rounds, 0–3 tap questions per round, the
  last round asks nothing. Haiku 5.5, structured output, effort low.
- **Teacher** (`for: "session"`, teacher accounts only): the topic is what the
  session is for ("Volleyball unit, week 2"). The class settings go along as
  context so the brief fits the time and equipment. Questions cover the sport
  or unit, season phase, goals, and what to emphasize or avoid.
- **Student** (`for: "student"`): the topic is their sport ("JV soccer,
  midfielder"). Questions cover position or event, season phase, and goals.
  The prompt forbids questions about injuries, pain, medical conditions,
  weight or body measurements, and forbids them in the brief.
- The brief is editable text (max 600 characters) before it's saved.

## 3. Research with sources (teacher)

- `POST /api/research` with `{ topic, config? }`, teacher accounts only.
- **Step 1, search:** Claude Sonnet 5.5 with `web_search_20260209`
  (dynamic filtering), `max_uses: 4`, effort low, and `allowed_domains` set to
  the trusted list below. Subdomains are included automatically (`nih.gov`
  covers PubMed). `pause_turn` is resumed by sending the paused turn back, up
  to 3 times. Server-side refusal fallback is on (`fallbacks: "default"`).
- **Step 2, structure:** web search always attaches citations, and structured
  output rejects citations, so findings come from a second call: Haiku 5.5
  with a JSON schema whose `source` field is an enum of the numbered sources
  the search actually returned. The model cannot invent a link: every URL
  shown is one the search returned, on an allowlisted host (checked again on
  the server).
- **Trusted list** (ASCII only, per the docs' homograph warning):
  `nsca.com`, `acsm.org`, `nih.gov`, `cdc.gov`, `nata.org`, `aap.org`,
  `healthychildren.org` (AAP's family site).
- The teacher pins up to 5 findings. Pinned findings live in the config as
  `{ title, url, takeaway }`; `clampConfig` drops any whose URL isn't https
  on an allowlisted host.
- **Cost cap:** $10 per 1,000 searches plus tokens. Rate limits: 10 research
  runs per teacher per hour, 100 per day across the app.

## 4. Where the briefs live and how generation uses them

- **Session or class brief + pinned research:** new `ClassConfig` fields
  `brief` and `sources`, so they're per session, copied with a session, and
  part of the AI check's signature (changing them re-runs the check). They
  go into `classParamsBlock`, which both generation and the AI check read.
- **Student brief:** new table `student_briefs` (`user_id` primary key →
  `auth.users` on delete cascade, `brief`, `updated_at`; RLS: read your own;
  writes through `/api/student-brief`). On save it is trimmed to 600
  characters, stripped of prompt-injection patterns like the other student
  text, and any sentence mentioning injuries, pain or medical details is
  dropped. Generation reads it with the service role and puts it in the
  student's message, never the teacher's system prompt, with the rule that
  the teacher's settings and brief win any conflict. Owner sample previews
  ignore it.
- **Student UI:** a "My sport" card on /me (consult, edit, delete), and a line
  on the workout form ("Your sport goals are included") when one is saved.
- **Teacher UI:** a "Plan with AI" card in the settings editor of teacher
  classes (defaults and sessions): the brief, "Help me write it" (consult),
  research, and pinned findings. Everything saves with the settings.
- **Privacy page:** says what the student brief stores and that it can be
  deleted.

## 5. What this does not do

- No research for students (minors on the open web). No health data stored.
- Students' briefs are not shown to teachers.
- No "why this exercise" lines, week planner, or presets (docs/02 §5 later ideas).

## 6. Verification plan

- tsc, lint, build.
- Extend the route harness (real handlers, stubbed caller, production DB,
  test class deleted afterwards): consult rounds for both audiences, a live
  research run (real web search on the trusted list), pinning and the URL
  clamp, student brief save / health-sentence filter / delete, and a
  generation that shows a brief steering the workout.
- Ryan checks the pages signed in.

## 7. Revision 2026-10-28: background first, session specifics after

Ryan asked to call the brief "general background knowledge/context for the
AI" with "session specifics asked after", to make research clearly optional,
and to give iPad/computer a tabbed layout. Built on branch `ai-background-tabs`:

- **`background`** (was `brief`) lives on the class's default settings: who
  the students are, the unit, standing rules. Every session uses the class's
  *current* background and pinned research at generation time
  (`generationConfig` in `lib/class-config.ts`); sessions never store them.
- **`specifics`** live on a session: the day's focus, what to avoid, how hard.
  The session consult (`for: "session"`) reads the background and asks about
  the day; it can start with nothing typed. The class consult is
  `for: "background"`.
- **Each save owns its fields.** `/api/save-class` takes either `{ config }`
  (settings; background and research kept) or `{ background, sources }`.
  `/api/class-sessions` PATCH takes `{ config }` (specifics kept) or
  `{ specifics }`. The AI check's signature covers the five settings only.
- **Research** sits under the background, collapsed, labeled Optional.
- **Tabs** (768px and up): class page Sessions · Settings · AI background ·
  Students · Workouts; session page Session specifics · Settings. Two-column
  layouts inside tabs start at 1024px. Phones keep one stacked column; student
  pages are unchanged. The open tab is in the URL (`?tab=`).
- No data migration: no class or session had a brief or pinned research yet.
