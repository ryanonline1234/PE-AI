# PE.AI — AI-Powered PE Workouts

Teachers configure workouts. Students get personalized AI-generated sessions.
The Anthropic API key **never touches the browser** — all AI calls run server-side.

---

## Stack

| Layer    | Tech                  |
|----------|-----------------------|
| Frontend | Next.js 16 (App Router, TypeScript, Tailwind v4) |
| Backend  | Next.js API Routes (serverless) |
| Database | Supabase (Postgres), schema in `supabase/migrations/` |
| AI       | Anthropic Claude Haiku (server-side only) |
| Hosting  | Vercel (git-connected; `main` = production) |

---

## 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New project
2. Apply the migrations in `supabase/migrations/` in order (Supabase CLI
   `supabase db push`, or paste each file into the SQL editor). They create
   `pe_classes`, `workout_reviews`, `rate_limits` and the `rate_limit_check()`
   function. RLS is on with no policies: only the service-role key reads them.
3. Go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. Local Development

```bash
# Clone and install
git clone <your-repo>
cd pe-ai
npm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in every value in .env.local

# Run dev server
npm run dev
# → http://localhost:3000
```

### .env.local values

```
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
INTERNAL_API_SECRET=any-random-string-you-choose
NEXT_PUBLIC_INTERNAL_API_SECRET=same-random-string-as-above
CRON_SECRET=another-random-string
```

> `INTERNAL_API_SECRET` and `NEXT_PUBLIC_INTERNAL_API_SECRET` must be identical.
> The browser sends the public one in a header and the server compares. It only
> stops casual drive-by requests — it ships in the JS bundle — so the real
> abuse control is the rate limiter (`lib/rate-limit.ts`).
> `CRON_SECRET` protects `/api/keepalive`, which Vercel Cron calls daily so the
> free-tier Supabase project never pauses over a school break.

---

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repo at [vercel.com](https://vercel.com) for auto-deploys.

In **Vercel → Project → Settings → Environment Variables**, add all six env vars
(`CRON_SECRET` as a sensitive variable).

---

## 4. How It Works

```
Teacher browser
  → POST /api/save-class  (code + config + teacher key)
  → Vercel serverless fn  → writes to Supabase
      first save issues a teacher key (shown once, SHA-256 stored);
      later saves and the daily report require it

Student browser
  → GET  /api/get-class?code=XXXX
  → Vercel serverless fn  → reads from Supabase → returns config

Student browser
  → POST /api/generate-workout  (code + student info)
  → Vercel serverless fn
      → rate-limits per class / per IP / global
      → reads config from Supabase       (students can't fake teacher settings)
      → builds system prompt from config (teacher controls the AI behaviour)
      → calls Anthropic API              (key never leaves the server)
      → returns workout JSON
  → Student sees their workout
```

---

## 5. Cost Estimate

| Service   | Free tier                  | Typical school usage |
|-----------|----------------------------|----------------------|
| Vercel    | 100 GB bandwidth / month   | Well within free     |
| Supabase  | 500 MB DB, 50k rows        | Well within free     |
| Anthropic | Pay per token              | ~$0.003 per workout  |

1,000 workouts ≈ **$3** in Anthropic API costs.

---

## 6. Project Structure

```
pe-ai/
├── app/
│   ├── layout.tsx                   # Root layout, next/font fonts, analytics
│   ├── globals.css                  # Design tokens (@theme) + print styles
│   ├── page.tsx                     # Full client UI (all views)
│   └── api/
│       ├── save-class/route.ts      # POST — save class config (teacher key)
│       ├── get-class/route.ts       # GET  — fetch class config
│       ├── generate-workout/route.ts# POST — AI workout generation
│       ├── submit-review/route.ts   # POST — student rating + comment
│       ├── generate-report/route.ts # POST — teacher daily report (teacher key)
│       └── keepalive/route.ts       # GET  — daily cron ping (CRON_SECRET)
├── lib/
│   ├── supabase.ts                  # Server-side Supabase client
│   ├── auth.ts                      # Shared-secret header check
│   ├── rate-limit.ts                # rate_limit_check() RPC wrapper
│   ├── teacher-key.ts               # Key generation + hashing
│   ├── teacher-key-store.ts         # Browser-side key memory
│   ├── time.ts                      # Local-day helpers for reports
│   ├── api.ts                       # Frontend fetch helpers
│   └── types.ts                     # Shared types
├── supabase/migrations/             # Tracked schema (baseline, teacher key, rate limits)
├── vercel.json                      # Cron schedule
├── CLAUDE.md · STATE.md · DECISIONS.md
└── README.md
```
