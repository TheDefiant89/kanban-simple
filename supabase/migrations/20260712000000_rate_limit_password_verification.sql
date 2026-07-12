-- Closes #35: change_own_password and delete_own_account
-- (20260710000000_harden_account_deletion_and_password_change.sql) verify
-- current_password server-side, but neither RPC limited how many times a
-- caller could guess it. A stolen/leaked access token alone was therefore
-- enough to mount an unthrottled online brute-force against either RPC
-- until the real password was found.
--
-- Adds a small attempt-tracking table plus a shared helper that both RPCs
-- call to verify current_password: 5 consecutive failures for a given user
-- lock further attempts out for 15 minutes; a successful verification
-- resets the counter.

create table public.password_verification_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS is enabled (matching every other table in this schema) even though no
-- policies are defined: this table is never queried directly via PostgREST,
-- only from the security definer functions below, which run as the table
-- owner and so are unaffected by RLS.
alter table public.password_verification_attempts enable row level security;

revoke all on public.password_verification_attempts from public, anon, authenticated;

-- Shared by change_own_password and delete_own_account. Raises 'Incorrect
-- password' on a wrong guess (same message the client already matches on)
-- or a lockout message once the failure threshold is hit; returns
-- normally only when current_password is correct.
create or replace function public._verify_current_password_rate_limited(target_user_id uuid, provided_password text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  max_attempts constant integer := 5;
  lockout_duration constant interval := interval '15 minutes';
  attempt_row public.password_verification_attempts;
  password_ok boolean;
  next_failed_count integer;
begin
  select * into attempt_row
  from public.password_verification_attempts
  where user_id = target_user_id
  for update;

  if attempt_row.locked_until is not null and attempt_row.locked_until > now() then
    raise exception 'Too many incorrect attempts. Try again in % minutes.',
      ceil(extract(epoch from (attempt_row.locked_until - now())) / 60);
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
    return;
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

  raise exception 'Incorrect password';
end;
$$;

revoke all on function public._verify_current_password_rate_limited(uuid, text) from public, anon, authenticated;

create or replace function public.delete_own_account(current_password text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public._verify_current_password_rate_limited(auth.uid(), current_password);

  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account(text) from public;
grant execute on function public.delete_own_account(text) to authenticated;
revoke execute on function public.delete_own_account(text) from anon;

create or replace function public.change_own_password(current_password text, new_password text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if new_password is null or length(new_password) < 8 then
    raise exception 'New password must be at least 8 characters';
  end if;

  perform public._verify_current_password_rate_limited(auth.uid(), current_password);

  update auth.users
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.change_own_password(text, text) from public;
grant execute on function public.change_own_password(text, text) to authenticated;
revoke execute on function public.change_own_password(text, text) from anon;
