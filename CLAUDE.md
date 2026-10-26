# PE.AI — project notes for agents

Account-less AI workout generator for school PE. Teacher sets parameters → 6-char
class code → each student gets a Claude-generated workout. Reviews + a teacher
daily report. Read `STATE.md` first (where we are, next action), `DECISIONS.md`
for why things are the way they are.

## Stack
Next.js 16 (App Router, TypeScript, Tailwind v4 via `@theme` in `app/globals.css`),
Supabase Postgres (service-role from API routes only), Anthropic SDK (Claude
Haiku), Vercel (git-connected: **push to `main` = production deploy**).

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
- **Teacher key** (`lib/teacher-key.ts`): per-class secret, SHA-256 stored,
  required for `save-class` and `generate-report`. Students only ever need the
  class code. Legacy classes (null hash) are claimed by their first keyed save.
- **Teacher config is clamped server-side** in `save-class`; students can't widen it.
- **Student free text is sanitized** before it reaches the model.
- **Schema changes go in `supabase/migrations/`** and are applied with the
  Supabase MCP `apply_migration` (or the CLI). Never hand-edit the live schema again.
- **"Today" for reports is the browser's time zone**, defaulting to America/Los_Angeles.

## Don'ts
- Don't push to `main` without Ryan's OK (it deploys). Work on a branch; Vercel
  builds a preview per push.
- Don't add `next/image`, auth, or student accounts without a decision in `DECISIONS.md`
  (minors' data; the FitTrack merge plan in `~/Archive/peai-unified` is parked).
- Don't revert to the `claude-haiku-4-5-20251001` dated id or DeepSeek; see DECISIONS.
