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

## 2026-10-26 — Generation moved to Haiku 5.5, streamed as JSON Lines
Ryan's call: switch outright, no A/B gate. `claude-haiku-5-5` with
`thinking: {type: "disabled"}` (it thinks by default; a workout list doesn't
need it and the student is waiting). The model now emits one JSON object per
line (meta, warm-ups, exercises, cool-downs) instead of one JSON document, so
the server can forward each item as it lands (`application/x-ndjson`) and the
browser renders the warm-up while the main workout is still being written.
Measured on the dev server against the live API: first item at 2–4 s, done at
8–10 s, versus a 12–16 s blank spinner before. Rate limits, sanitizing and the
teacher-controlled prompt are unchanged. Structured outputs were not used:
they constrain one document, not a sequence.

## 2026-10-26 — Workouts are persisted under a share id
Table `workouts` (id, class_code, student_name, workout jsonb, created_at),
written by the generation route once the stream completes. The browser then
rewrites its URL to `/w/<id>` so refresh, back, and "send to a partner" all
work; `/w/[id]` is server-rendered from the table. The id is 8 chars from the
class-code alphabet (~1e12 space), unguessable in practice and never listed.
Privacy: a row holds a first name (optional, already collected for reviews)
and the workout text — no account, no device id. Noindex on the share page.

## 2026-10-26 — PWA: manifest + a deliberately small service worker
`app/manifest.ts` + icons make it installable; `public/sw.js` caches hashed
assets and keeps the last page copy for offline opens. It does not try to
make generation work offline (it can't). Serwist/Workbox were considered
and rejected as weight for a two-rule worker.

## 2026-10-26 — The AI checks its understanding with teachers and students
Ryan asked for back-and-forth so the AI "actually understands" the teacher and
student, and for an explanation after a regeneration. Ryan went with recs:

- **Teacher check** (`/api/clarify-class`, structured output, effort low): on
  Save, when the settings changed since the last confirmed check, the AI says
  back what every workout will look like and asks 0-3 questions with tap
  answers. Answers go back for up to 3 rounds. The confirmed `summary` and the
  `clarifications` (max 6, removable in the UI) are stored in
  `pe_classes.config` and injected into every generation's system prompt.
  Measured: no questions on a clear setup; on a messy one it caught "weights"
  ambiguity, the theme reading, and an impossible calorie target.
- **Student questions live inside the generation call**, not a separate
  pre-check, so the common case adds zero latency. The model may emit 1-2
  `question` lines instead of the workout; the server stops and sends
  `needs_answers`. Allowed only on a first generation with no answers and no
  Skip. The first prompt wording ("most students need no questions") made it
  never ask; the trigger is now concrete: pain/injury/condition without
  detail, or a preference that clashes with the setup. Measured: asks on
  "my knee hurts sometimes", "back pain", "asthma" (questions at 2-4 s);
  silent on blank notes, a specific injury, and clear preferences. Answers
  are sent to the model only, never stored, and carry over to regenerations.
- **Regeneration edits the previous workout.** Before this the model never
  saw it and rerolled from scratch. The client sends `previousId`; the server
  loads it (same class only) and the stream opens with a `note` line, saved
  with the workout and shown on the share page.
- **Teacher sample preview** reuses the generation route with `sample: true`
  (typical student, nothing saved, same rate limits).
