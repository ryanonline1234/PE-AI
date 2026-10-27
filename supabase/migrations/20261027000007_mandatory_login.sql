-- Mandatory sign-in for everyone, no teacher keys, personal classes.
-- See DECISIONS.md 2026-10-27. Additive only: the old teacher_key_hash column
-- stays (unused) but signed-in users can never read it (column grants below).

-- ── Personal classes ────────────────────────────────────────────────────
-- 'class'    = a teacher's class: any signed-in Mitty user with the code can join.
-- 'personal' = a student's own training log: only the owner can use it.
alter table public.pe_classes add column if not exists kind text not null default 'class';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pe_classes_kind_check') then
    alter table public.pe_classes add constraint pe_classes_kind_check check (kind in ('class', 'personal'));
  end if;
end $$;

-- ── Who has joined which class ──────────────────────────────────────────
create table if not exists public.class_members (
  class_id  uuid not null references public.pe_classes(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists class_members_user_idx on public.class_members (user_id);
alter table public.class_members enable row level security;

-- Ratings now belong to a signed-in student and (when known) a workout.
alter table public.workout_reviews add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.workout_reviews add column if not exists workout_id text references public.workouts(id) on delete set null;
create index if not exists workout_reviews_user_idx on public.workout_reviews (user_id);

-- ── Helpers for policies (private schema: not exposed through the API) ──
-- SECURITY DEFINER so policies on pe_classes / class_members / profiles can
-- refer to each other without RLS recursion. Each returns only rows about the
-- calling user.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.my_owned_class_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.pe_classes where owner_id = (select auth.uid())
$$;

create or replace function private.my_member_class_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select class_id from public.class_members where user_id = (select auth.uid())
$$;

create or replace function private.my_students()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.user_id
  from public.class_members m
  join public.pe_classes c on c.id = m.class_id
  where c.owner_id = (select auth.uid())
$$;

revoke execute on function private.my_owned_class_ids(), private.my_member_class_ids(), private.my_students() from public, anon;
grant execute on function private.my_owned_class_ids(), private.my_member_class_ids(), private.my_students() to authenticated;

-- ── Read policies ───────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pe_classes' and policyname = 'classes: members read') then
    create policy "classes: members read" on public.pe_classes
      for select to authenticated
      using (id in (select private.my_member_class_ids()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'class_members' and policyname = 'members: self or class owner reads') then
    create policy "members: self or class owner reads" on public.class_members
      for select to authenticated
      using (user_id = (select auth.uid()) or class_id in (select private.my_owned_class_ids()));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles: teacher reads own students') then
    create policy "profiles: teacher reads own students" on public.profiles
      for select to authenticated
      using (id in (select private.my_students()));
  end if;
end $$;

-- ── Hide the retired teacher key hash from every signed-in read ─────────
revoke select on public.pe_classes from authenticated;
grant select (id, code, config, label, archived, owner_id, kind, created_at, updated_at) on public.pe_classes to authenticated;
