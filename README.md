# PE.AI — AI-Powered PE Workouts

Teachers configure workouts. Students get personalized AI-generated sessions.
The Anthropic API key **never touches the browser** — all AI calls run server-side.

---

## Stack

| Layer    | Tech                  |
|----------|-----------------------|
| Frontend | Next.js 15 (App Router) |
| Backend  | Next.js API Routes (serverless) |
| Database | Supabase (Postgres)   |
| AI       | Anthropic Claude Sonnet (server-side only) |
| Hosting  | Vercel (free tier)    |

---

## 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New project
2. Open **SQL Editor** and run:

```sql
create table pe_classes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  config      jsonb not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Index for fast lookups by code
create index pe_classes_code_idx on pe_classes (code);

-- Enable Row Level Security (service role key bypasses this)
alter table pe_classes enable row level security;
```

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
# Fill in all four values in .env.local

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
```

> Note: `INTERNAL_API_SECRET` and `NEXT_PUBLIC_INTERNAL_API_SECRET` must be
> identical. The NEXT_PUBLIC_ version is sent by the browser in request headers;
> the server checks it against the non-public version. This prevents random
> internet traffic from calling your API routes.

---

## 3. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repo at [vercel.com](https://vercel.com) for auto-deploys.

In **Vercel → Project → Settings → Environment Variables**, add all five env vars.

---

## 4. How It Works

```
Teacher browser
  → POST /api/save-class  (code + config)
  → Vercel serverless fn  → writes to Supabase

Student browser
  → GET  /api/get-class?code=XXXX
  → Vercel serverless fn  → reads from Supabase → returns config

Student browser
  → POST /api/generate-workout  (code + student info)
  → Vercel serverless fn
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
│   ├── layout.jsx                   # Root layout + fonts
│   ├── globals.css                  # CSS variables + print styles
│   ├── page.jsx                     # Full client UI (all views)
│   └── api/
│       ├── save-class/route.js      # POST — save class config
│       ├── get-class/route.js       # GET  — fetch class config
│       └── generate-workout/route.js # POST — AI workout generation
├── lib/
│   ├── supabase.js                  # Server-side Supabase client
│   ├── auth.js                      # Shared secret verification
│   └── api.js                       # Frontend fetch helpers
├── .env.local.example
├── jsconfig.json                    # @ path alias
└── README.md
```
