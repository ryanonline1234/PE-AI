# PE.AI — project notes for agents

AI workout generator for school PE (Archbishop Mitty). Everyone signs in with a
Mitty Google account. Teacher sets parameters → 6-char class code → each signed-in
student gets a Claude-generated workout. Rosters, ratings, a daily report, and
students' own personal classes. Read `STATE.md` first (where we are, next action), `DECISIONS.md`
for why things are the way they are.

## Stack
Next.js 16 (App Router, TypeScript, Tailwind v4 via `@theme` in `app/globals.css`),
Supabase Postgres (service-role from API routes only), Anthropic SDK (Claude
Haiku 5.5, streamed as JSON Lines), Vercel (git-connected: **push to `main` = production deploy**).

## Dev loop
```bash
npm install
npm run dev        # http://localhost:3000, uses .env.local (points at the live Supabase project)
npx tsc --noEmit && npm run lint && npm run build   # closing ritual before any push
```
`.env.local` holds real keys (see `.env.local.example` for the list). Local dev
writes to the production database — that's fine for test classes, don't bulk-edit.

## Conventions worth keeping
- **Design tokens live in `app/globals.css`** (`--accent` lime, Barlow Condensed
  display + DM Sans body, loaded through `next/font` in `app/layout.tsx`). Keep the look.
- **All AI + DB access is server-side** in `app/api/*`. The browser only talks to
  our routes. `x-internal-secret` is obscurity, not security — rate limits
  (`lib/rate-limit.ts`, Postgres function `rate_limit_check`) are the real cap.
- **Accounts** (`docs/01-teacher-accounts.md`, DECISIONS 2026-10-27): Supabase Auth
  with Google, Mitty domains only. Roles: teacher (@mitty.com), student
  (@mittymonarch.com), admin (set by hand). `lib/supabase-auth.ts` (user-scoped
  clients, `getAccount`), `lib/teacher-auth.ts` (`callerFromRequest` for API
  routes), `lib/class-access.ts` (class lookup + "personal classes are owner-only"),
  `proxy.ts` (session refresh for pages). Pages READ through RLS; API routes WRITE
  with the service role after an explicit owner/access check. No teacher keys.
- **Class config is clamped server-side** (`lib/class-config.ts`); nobody can widen it.
- **Sessions** (`docs/02-sessions.md`): a teacher class has dated sessions
  (`class_sessions`, one per school date in America/Los_Angeles) with their own
  config; the class's own config is its default settings. Generation resolves
  the session on the server (`app/api/generate-workout`, step 4c) and saves
  `workouts.session_id`. The prompt lives in `lib/workout-prompt.ts`. No calorie
  targets: the AI estimates.
- **Planning help** (`docs/03-planning-help.md`): a session's `brief` + pinned
  `sources` live in its config (`classParamsBlock` feeds both generation and the
  AI check). `/api/consult` drafts briefs; `/api/research` = Sonnet 5.5 web search
  limited to `lib/trusted-sources.ts`, then Haiku structures findings with the
  source as an enum (no invented links). A student's own brief is in
  `student_briefs`, cleaned by `lib/student-brief.ts` (no health details), and
  goes in the student's message, not the system prompt. Generation stays tool-free.
- **Teachers' own workouts** (`/teacher/workout`, DECISIONS 2026-10-28): a
  teacher's one personal class is their own-workout space; inline settings in
  `generate-workout` apply only to the owner of a personal class. Equipment is
  chips + Other over the same text field (`lib/equipment.ts`).
- **Student free text is sanitized** before it reaches the model, and **names never
  reach the model** (workout prompt and teacher report are name-free).
- **The AI talks back.** Teacher check (`/api/clarify-class`) stores a confirmed
  `summary` + `clarifications` in the class config; generation may emit
  `question` lines before the workout, and a `note` line on regenerations. The
  JSON Lines event types live in `lib/workout-stream.ts` and `lib/types.ts`.
- **Schema changes go in `supabase/migrations/`** and are applied with the
  Supabase MCP `apply_migration` (or the CLI). Never hand-edit the live schema again.
  The MCP declines statements containing `drop`; write additive, guarded DDL.
- **"Today" for reports is the browser's time zone**, defaulting to America/Los_Angeles.

## Don'ts
- Don't push to `main` without Ryan's OK (it deploys). Work on a branch; Vercel
  builds a preview per push.
- Don't add `next/image` or student accounts without a decision in `DECISIONS.md`
  (minors' data; the FitTrack merge plan in `~/Archive/peai-unified` is parked).
- Don't revert to Haiku 4.5 / the dated id / DeepSeek, or to one-document JSON
  output; see DECISIONS (streaming depends on the JSON Lines format).
- Don't re-enable thinking on generation without measuring latency; see DECISIONS.
