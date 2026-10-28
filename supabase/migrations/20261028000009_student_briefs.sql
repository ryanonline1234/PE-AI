-- A student's own sport brief (docs/03-planning-help.md, DECISIONS 2026-10-28):
-- up to 600 characters about their sport, position, season and goals, written
-- with the AI's sport consult and used in every workout they generate. No
-- health details (stripped on save). Deleted with the account. Additive and
-- idempotent.

create table if not exists public.student_briefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  brief      text not null,
  updated_at timestamptz not null default now()
);
alter table public.student_briefs enable row level security;

-- Pages read through RLS: you see only your own. API routes write with the
-- service role after checking the caller.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'student_briefs' and policyname = 'briefs: read own') then
    create policy "briefs: read own" on public.student_briefs
  for select to authenticated
  using (user_id = (select auth.uid()));
  end if;
end $$;
