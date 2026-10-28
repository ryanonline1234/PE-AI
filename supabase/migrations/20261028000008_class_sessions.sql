-- Dated sessions (docs/02-sessions.md, DECISIONS 2026-10-28). A session is one
-- teacher class on one school date with its own settings; students get today's
-- session, or the class's own config (its default settings) on a day without
-- one. Additive and idempotent.

create table if not exists public.class_sessions (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.pe_classes(id) on delete cascade,
  session_date date not null,
  name         text,
  config       jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (class_id, session_date)
);
alter table public.class_sessions enable row level security;

-- Pages read through RLS: the class owner sees its sessions. API routes write
-- with the service role after an explicit owner check.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_sessions' and policyname = 'sessions: class owner reads') then
    create policy "sessions: class owner reads" on public.class_sessions
  for select to authenticated
  using (class_id in (select id from public.pe_classes where owner_id = (select auth.uid())));
  end if;
end $$;

-- Which session a workout was built from (null = the class defaults). Deleting
-- a session keeps its workouts.
alter table public.workouts add column if not exists session_id uuid references public.class_sessions(id) on delete set null;
create index if not exists workouts_session_idx on public.workouts (session_id);
