-- Fixes #45: _verify_current_password_rate_limited (added by 20260712000000
-- to close #35) recorded a failed attempt with an INSERT ... ON CONFLICT and
-- then unconditionally `raise exception 'Incorrect password'` in the same
-- statement, with no BEGIN...EXCEPTION...END anywhere in the call chain. An
-- uncaught exception aborts the *entire* enclosing transaction -- for a
-- PostgREST RPC call that's the whole request -- which rolled back the
-- INSERT that had just recorded the failure. Every failed guess was
-- recorded and then immediately un-recorded, so failed_count never
-- persisted and lockout could never trigger: the rate limiter added to
-- close #35 didn't actually limit anything.
--
-- This switches _verify_current_password_rate_limited (and its two
-- callers) to RETURN a status ('ok' / 'incorrect_password' / 'locked_out')
-- for the current_password check instead of raising for it. This matches
-- the semantics src/services/auth.ts, src/services/account.ts, and
-- src/types/database.ts already implement/declare (they were written
-- against the never-deployed 20260711000000 migration, see #44). Returning
-- a value lets the attempt-counter write commit normally along with the
-- rest of the transaction instead of needing to survive an exception. Only
-- the genuinely exceptional paths (not authenticated, new password too
-- short) still raise.

-- CREATE OR REPLACE cannot change a function's return type, so the
-- void-returning versions need to be dropped first.
drop function if exists public._verify_current_password_rate_limited(uuid, text);
drop function if exists public.delete_own_account(text);
drop function if exists public.change_own_password(text, text);

create function public._verify_current_password_rate_limited(target_user_id uuid, provided_password text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  max_attempts constant integer := 5;
  lockout_duration constant interval := interval '15 minutes';
  attempt_row public.password_verification_attempts%rowtype;
  password_ok boolean;
  next_failed_count integer;
begin
  select * into attempt_row
  from public.password_verification_attempts
  where user_id = target_user_id
  for update;

  if attempt_row.locked_until is not null and attempt_row.locked_until > now() then
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

  next_failed_count := coalesce(attempt_row.failed_count, 0) + 1;

  insert into public.password_verification_attempts (user_id, failed_count, locked_until, updated_at)
  values (
    target_user_id,
    next_failed_count,
    case when next_failed_count >= max_attempts then now() + lockout_duration else null end,
    now()
  )
  on conflict (user_id) do update
    set failed_count = next_failed_count,
        locked_until = case when next_failed_count >= max_attempts then now() + lockout_duration else null end,
        updated_at = now();

  if next_failed_count >= max_attempts then
    return 'locked_out';
  end if;

  return 'incorrect_password';
end;
$$;

revoke all on function public._verify_current_password_rate_limited(uuid, text) from public, anon, authenticated;

create function public.delete_own_account(current_password text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_status := public._verify_current_password_rate_limited(auth.uid(), current_password);
  if v_status <> 'ok' then
    return v_status;
  end if;

  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();

  return 'ok';
end;
$$;

revoke all on function public.delete_own_account(text) from public;
grant execute on function public.delete_own_account(text) to authenticated;
revoke execute on function public.delete_own_account(text) from anon;

create function public.change_own_password(current_password text, new_password text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if new_password is null or length(new_password) < 8 then
    raise exception 'New password must be at least 8 characters';
  end if;

  v_status := public._verify_current_password_rate_limited(auth.uid(), current_password);
  if v_status <> 'ok' then
    return v_status;
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = auth.uid();

  return 'ok';
end;
$$;

revoke all on function public.change_own_password(text, text) from public;
grant execute on function public.change_own_password(text, text) to authenticated;
revoke execute on function public.change_own_password(text, text) from anon;
