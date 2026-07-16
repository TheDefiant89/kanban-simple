-- Fixes #51: _verify_current_password_rate_limited (the returns-text version
-- from 20260713061949/20260713000000, still live) reads the attempt row with
-- `SELECT ... FOR UPDATE` and then computes next_failed_count from that
-- snapshot before writing it via `INSERT ... ON CONFLICT DO UPDATE SET
-- failed_count = next_failed_count`. `FOR UPDATE` only serializes
-- transactions when a matching row already exists to lock -- for a
-- target_user_id with no row yet (true for every account's first-ever
-- failed attempt, since the table is populated lazily), every concurrent
-- transaction reads attempt_row as all-NULL and independently computes
-- next_failed_count = 1, then overwrites the row with that stale value
-- instead of incrementing whatever a sibling transaction already committed.
-- Firing guesses concurrently instead of serially therefore lets an
-- attacker with a stolen access token brute-force change_own_password /
-- delete_own_account past the 5-attempt threshold indefinitely, defeating
-- the lockout #35/#45 added.
--
-- Fix: keep an initial SELECT only for the already-locked-out fast path.
-- The failure-counting write becomes a single atomic
-- `INSERT ... ON CONFLICT DO UPDATE` that computes failed_count/locked_until
-- from `password_verification_attempts.failed_count` -- the conflicting
-- row's value as Postgres sees it at the moment it applies this row's
-- update, which is serialized against concurrent upserts on the same
-- primary key -- instead of from the earlier, possibly-stale snapshot.

create or replace function public._verify_current_password_rate_limited(target_user_id uuid, provided_password text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  max_attempts constant integer := 5;
  lockout_duration constant interval := interval '15 minutes';
  existing_locked_until timestamptz;
  password_ok boolean;
  next_failed_count integer;
begin
  select locked_until into existing_locked_until
  from public.password_verification_attempts
  where user_id = target_user_id;

  if existing_locked_until is not null and existing_locked_until > now() then
    return 'locked_out';
  end if;

  select exists (
    select 1 from auth.users
    where id = target_user_id
      and encrypted_password = extensions.crypt(provided_password, encrypted_password)
  ) into password_ok;

  if password_ok then
    insert into public.password_verification_attempts (user_id, failed_count, locked_until, updated_at)
    values (target_user_id, 0, null, now())
    on conflict (user_id) do update
      set failed_count = 0, locked_until = null, updated_at = now();
    return 'ok';
  end if;

  insert into public.password_verification_attempts (user_id, failed_count, locked_until, updated_at)
  values (target_user_id, 1, null, now())
  on conflict (user_id) do update
    set failed_count = password_verification_attempts.failed_count + 1,
        locked_until = case
          when password_verification_attempts.failed_count + 1 >= max_attempts
          then now() + lockout_duration
          else null
        end,
        updated_at = now()
  returning failed_count into next_failed_count;

  if next_failed_count >= max_attempts then
    return 'locked_out';
  end if;

  return 'incorrect_password';
end;
$$;

revoke all on function public._verify_current_password_rate_limited(uuid, text) from public, anon, authenticated;
