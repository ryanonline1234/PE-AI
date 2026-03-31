-- Run this in your Supabase SQL editor to add the workout reviews table.

create table workout_reviews (
  id           uuid primary key default gen_random_uuid(),
  class_code   text not null,
  student_name text,
  rating       integer not null check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz default now()
);

create index workout_reviews_class_code_idx on workout_reviews (class_code);
create index workout_reviews_created_at_idx on workout_reviews (created_at);

alter table workout_reviews enable row level security;
