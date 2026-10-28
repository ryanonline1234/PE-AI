-- Named setting presets (DECISIONS 2026-10-28): a teacher saves any mix of the
-- settings (duration, equipment, intensity, focus, custom instructions, AI
-- background) under a name, then applies it to a class, a session, a new class,
-- or every class at once. Applying copies the values in; nothing stays linked.
-- Additive and idempotent.

create table if not exists public.setting_presets (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  fields     jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);
alter table public.setting_presets enable row level security;

-- Pages read through RLS: a teacher sees their own presets. API routes write
-- with the service role after checking the caller.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'setting_presets' and policyname = 'presets: owner reads') then
    create policy "presets: owner reads" on public.setting_presets
  for select to authenticated
  using (owner_id = (select auth.uid()));
  end if;
end $$;
