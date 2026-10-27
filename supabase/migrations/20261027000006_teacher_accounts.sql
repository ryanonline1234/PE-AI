-- Teacher accounts (docs/01-teacher-accounts.md). Mitty Google sign-in via
-- Supabase Auth; the Before User Created hook (migration 000005) only admits
-- @mitty.com and @mittymonarch.com.
--
-- Writes stay server-side (API routes with the service role, after checking the
-- session). Signed-in teachers READ through a user-scoped client, so the
-- policies below are what keeps one teacher out of another teacher's classes.

-- ── Profiles ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text,
  role         text not null default 'student' check (role in ('teacher', 'student', 'admin')),
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Faculty (@mitty.com) are teachers from the first sign-in; everyone else is a
-- student until promoted by hand (Ryan's own account becomes 'admin').
create or replace function public.role_for_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case split_part(lower(coalesce(p_email, '')), '@', 2)
    when 'mitty.com' then 'teacher'
    else 'student'
  end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    public.role_for_email(new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Class ownership + labels ────────────────────────────────────────────
alter table public.pe_classes add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.pe_classes add column if not exists label    text;
alter table public.pe_classes add column if not exists archived boolean not null default false;
create index if not exists pe_classes_owner_idx on public.pe_classes (owner_id);

-- Workouts a teacher generated themselves (sample previews while signed in).
alter table public.workouts add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists workouts_created_by_idx on public.workouts (created_by, created_at desc);

-- ── Filing: any workout under any of the teacher's labeled classes ──────
create table if not exists public.class_workouts (
  class_id   uuid not null references public.pe_classes(id) on delete cascade,
  workout_id text not null references public.workouts(id) on delete cascade,
  added_by   uuid references auth.users(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (class_id, workout_id)
);
create index if not exists class_workouts_workout_idx on public.class_workouts (workout_id);
alter table public.class_workouts enable row level security;

-- ── Read policies for signed-in users (anon still sees nothing) ─────────
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles: read own') then
    create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pe_classes' and policyname = 'classes: owner reads') then
    create policy "classes: owner reads" on public.pe_classes
  for select to authenticated
  using (owner_id = (select auth.uid()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workouts' and policyname = 'workouts: owner or creator reads') then
    create policy "workouts: owner or creator reads" on public.workouts
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or class_code in (select code from public.pe_classes where owner_id = (select auth.uid()))
  );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workout_reviews' and policyname = 'reviews: class owner reads') then
    create policy "reviews: class owner reads" on public.workout_reviews
  for select to authenticated
  using (class_code in (select code from public.pe_classes where owner_id = (select auth.uid())));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_workouts' and policyname = 'filing: class owner reads') then
    create policy "filing: class owner reads" on public.class_workouts
  for select to authenticated
  using (class_id in (select id from public.pe_classes where owner_id = (select auth.uid())));
  end if;
end $$;
