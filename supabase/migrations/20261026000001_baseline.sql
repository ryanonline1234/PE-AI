-- Baseline: the schema that already existed in production (applied by hand via
-- the SQL editor in March 2026). Idempotent so it can be recorded as a tracked
-- migration against the live project without touching existing rows.

create table if not exists pe_classes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  config      jsonb not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists pe_classes_code_idx on pe_classes (code);
alter table pe_classes enable row level security;

create table if not exists workout_reviews (
  id           uuid primary key default gen_random_uuid(),
  class_code   text not null,
  student_name text,
  rating       integer not null check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz default now()
);
create index if not exists workout_reviews_class_code_idx on workout_reviews (class_code);
create index if not exists workout_reviews_created_at_idx on workout_reviews (created_at);
alter table workout_reviews enable row level security;

-- RLS is enabled with NO policies on purpose: only the server-side service-role
-- client (which bypasses RLS) touches these tables. The anon key can read nothing.
