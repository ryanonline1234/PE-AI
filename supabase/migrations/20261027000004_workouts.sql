-- Persisted workouts: every generated workout is saved under a short share id so
-- a student can refresh, reopen, or send the link (/w/<id>) without regenerating.
-- Only the service role touches this table (RLS on, no policies), same as the rest.

create table if not exists workouts (
  id           text primary key,                 -- 8 chars, same alphabet as class codes
  class_code   text not null references pe_classes(code) on delete cascade,
  student_name text,
  workout      jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists workouts_class_code_created_at_idx on workouts (class_code, created_at desc);
alter table workouts enable row level security;
