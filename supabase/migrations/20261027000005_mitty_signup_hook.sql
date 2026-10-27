-- Before User Created auth hook: only Mitty school Google accounts can create
-- a PE.AI account. Faculty are @mitty.com, students @mittymonarch.com (the
-- same domains the Mitty Business Club portal enforces). Enabled in the
-- dashboard: Authentication → Hooks → Before User Created → Postgres →
-- public.hook_restrict_signup_to_mitty. See docs/01-teacher-accounts.md.

create or replace function public.hook_restrict_signup_to_mitty(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  email  text := lower(coalesce(event->'user'->>'email', ''));
  domain text := split_part(email, '@', 2);
begin
  if domain in ('mitty.com', 'mittymonarch.com') then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'PE.AI sign-in is for Mitty school Google accounts only.',
      'http_code', 403
    )
  );
end;
$$;

-- Only Supabase Auth may call it; never callable through the API.
grant execute on function public.hook_restrict_signup_to_mitty(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_to_mitty(jsonb) from authenticated, anon, public;
