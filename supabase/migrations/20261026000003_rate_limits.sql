-- Fixed-window rate limiting, shared across Vercel function instances.
-- One RPC per request checks several buckets at once (per class code, per IP,
-- global) and returns the name of the first bucket that is over its limit,
-- or NULL when the request is allowed. Counts are incremented on every check,
-- so an over-limit caller stays over-limit until the window rolls.

create table if not exists rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, window_start)
);
alter table rate_limits enable row level security;

create or replace function rate_limit_check(
  p_buckets text[],
  p_windows int[],   -- window length in seconds, per bucket
  p_limits  int[]    -- max hits per window, per bucket
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  i   int;
  ws  timestamptz;
  c   int;
  hit text := null;
begin
  if array_length(p_buckets, 1) is null then
    return null;
  end if;

  for i in 1 .. array_length(p_buckets, 1) loop
    ws := to_timestamp(floor(extract(epoch from now()) / p_windows[i]) * p_windows[i]);
    insert into rate_limits (bucket, window_start, count)
      values (p_buckets[i], ws, 1)
      on conflict (bucket, window_start)
      do update set count = rate_limits.count + 1
      returning count into c;
    if hit is null and c > p_limits[i] then
      hit := p_buckets[i];
    end if;
  end loop;

  -- Opportunistic cleanup of old windows (about 1 in 100 calls).
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return hit;
end
$$;

-- Only the server-side service-role client may call this.
revoke all on function rate_limit_check(text[], int[], int[]) from public;
revoke all on function rate_limit_check(text[], int[], int[]) from anon, authenticated;
grant execute on function rate_limit_check(text[], int[], int[]) to service_role;
