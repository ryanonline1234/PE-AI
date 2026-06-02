-- ============================================================================
-- PE.AI + FitTrack — merged schema (DATA_MODEL.md)
-- ============================================================================
-- Phase 0: this migration is AUTHORED but NOT APPLIED. The tables below are
-- created for the merged platform but stay UNUSED until Phase 1 wires up auth
-- (magic-link) — nothing writes to them before there is an authenticated
-- `auth.uid()` for the per-owner RLS to key off.
--
-- IMPORTANT:
--   * The existing `pe_classes` table and the current generation flow are
--     intentionally LEFT ALONE — this migration does not touch or replace them.
--     The pe_classes -> classes migration happens in a later phase, not here.
--   * Do not apply this to the live Supabase project (btdfzxcrbmcynpnrhzzz)
--     during Phase 0. Apply in Phase 1 alongside auth.
--   * SQL below is reproduced exactly as written in DATA_MODEL.md. The only
--     addition is the explicit grant/revoke on class_adherence (last block),
--     which implements DATA_MODEL.md's own directive that the security-definer
--     function be executable only by authenticated users.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Tables ──────────────────────────────────────────────────────────────────

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'student' check (role in ('student','teacher')),
  created_at   timestamptz not null default now()
);

create table classes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null check (code ~ '^[A-Z0-9]{6}$'),
  teacher_id  uuid not null references profiles(id) on delete cascade,
  name        text,
  config      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index classes_code_idx on classes(code);

create table class_memberships (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references profiles(id) on delete cascade,
  class_id    uuid not null references classes(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  unique(student_id, class_id)
);

create table exercises (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  canonical_name text not null unique,
  muscle_group   text,
  equipment      text,
  created_at     timestamptz not null default now()
);

create table summaries (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references profiles(id) on delete cascade,
  class_id      uuid references classes(id) on delete set null,
  scope         text not null default 'student' check (scope in ('student','class')),
  period_start  date not null,
  period_end    date not null,
  digest_md     text not null,
  generated_at  timestamptz not null default now()
);

create table generated_workouts (
  id                      uuid primary key default gen_random_uuid(),
  student_id              uuid not null references profiles(id) on delete cascade,
  class_id                uuid not null references classes(id) on delete cascade,
  generated_at            timestamptz not null default now(),
  workout_json            jsonb not null,
  informed_by_summary_id  uuid references summaries(id) on delete set null
);

create table workout_sessions (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references profiles(id) on delete cascade,
  class_id              uuid references classes(id) on delete set null,
  generated_workout_id  uuid references generated_workouts(id) on delete set null,
  performed_at          timestamptz not null default now(),
  duration_min          int,
  session_feel          int check (session_feel between 1 and 5),
  notes                 text
);

create table sets (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references workout_sessions(id) on delete cascade,
  exercise_id   uuid not null references exercises(id),
  set_index     int not null,
  reps          int,
  weight        numeric,
  duration_sec  int,
  rpe           int check (rpe between 1 and 10),
  completed     boolean not null default true
);

-- ── Row-Level Security ───────────────────────────────────────────────────────
-- Enable RLS on every table. The critical design is that teachers reach student
-- rows only through aggregate, never raw.

alter table profiles            enable row level security;
alter table classes             enable row level security;
alter table class_memberships   enable row level security;
alter table generated_workouts  enable row level security;
alter table workout_sessions    enable row level security;
alter table sets                enable row level security;
alter table summaries           enable row level security;
-- exercises: catalog is world-readable; writes via service role only.
alter table exercises           enable row level security;
create policy exercises_read on exercises for select using (true);

-- profiles — own row; teachers may read display_name of students in their
-- classes (for a roster), nothing more.
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
-- roster read handled via a restricted view exposing only id + display_name.

-- classes — teacher owns; members may read config.
create policy classes_owner on classes
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy classes_member_read on classes
  for select using (
    exists (select 1 from class_memberships m
            where m.class_id = classes.id and m.student_id = auth.uid())
  );

-- class_memberships — student manages own; teacher reads memberships of own classes.
create policy memb_self on class_memberships
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy memb_teacher_read on class_memberships
  for select using (
    exists (select 1 from classes c
            where c.id = class_memberships.class_id and c.teacher_id = auth.uid())
  );

-- generated_workouts / workout_sessions / sets / summaries — strictly owner.
create policy gw_owner on generated_workouts
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy ws_owner on workout_sessions
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy sets_owner on sets
  for all using (
    exists (select 1 from workout_sessions s
            where s.id = sets.session_id and s.student_id = auth.uid())
  )
  with check (
    exists (select 1 from workout_sessions s
            where s.id = sets.session_id and s.student_id = auth.uid())
  );

create policy sum_owner on summaries
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

-- ── Teacher adherence — aggregate only ───────────────────────────────────────
-- No teacher SELECT policy on raw workout_sessions/sets. Instead a security-
-- definer function returns ONLY aggregate columns (completion %, count of
-- sessions) per student-in-class — never session_feel, rpe, or notes. This is
-- the privacy line in code: raw rows are owner-only; the teacher's view is a
-- derived aggregate that structurally cannot leak a student's private detail.

-- security definer: runs with elevated rights but returns only aggregates.
create or replace function class_adherence(p_class_id uuid)
returns table (student_id uuid, sessions_logged int, completion_pct numeric)
language sql security definer as $$
  select ws.student_id,
         count(*)::int as sessions_logged,
         round(avg(case when s.completed then 1 else 0 end) * 100, 1) as completion_pct
  from workout_sessions ws
  join sets s on s.session_id = ws.id
  where ws.class_id = p_class_id
  group by ws.student_id
$$;
-- grant execute only to authenticated; inside the route, verify caller owns the class.
revoke execute on function class_adherence(uuid) from public;
grant execute on function class_adherence(uuid) to authenticated;
