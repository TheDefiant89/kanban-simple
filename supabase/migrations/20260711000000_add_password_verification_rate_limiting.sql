-- Closes #35: change_own_password() and delete_own_account() (added by #34)
-- verify current_password server-side, but neither RPC limited how many
-- times a caller could guess it. A stolen/leaked access token alone was
-- therefore enough to mount an unthrottled online brute-force against a
-- victim's password via either endpoint.
--
-- Add a shared per-user attempt counter: 5 incorrect verifications lock
-- further attempts on *both* RPCs for 15 minutes (they guard the same
-- secret, so a guess against one counts against the other too). The
-- counter resets on a successful verification, and a fresh window starts
-- once a prior lockout has expired.
--
-- Both functions now RETURN a status ('ok' / 'incorrect_password' /
-- 'locked_out') for the current_password check instead of raising an
-- exception for it, and only raise for the actual not-authenticated /
-- validation cases. An uncaught RAISE EXCEPTION aborts the *entire*
-- calling transaction, which would silently roll back the attempt-counter
-- write recorded moments earlier in the same call -- Postgres has no
-- autonomous transactions, so "record the failure" and "reject via
-- exception" can't both survive in one function invocation. Returning a
-- value instead lets the tracking write commit normally; the client
-- wrappers (src/services/auth.ts, src/services/account.ts) turn the
-- returned status back into a thrown error.

create table public.password_verification_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failed_count integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.password_verification_attempts enable row level security;
-- No policies: this table is only ever read/written by the security
-- definer functions below (which bypass RLS as their owner). Clients have
-- no legitimate reason to query it directly, so anon/authenticated get no
-- access at all, matching the lockdown-by-default posture used elsewhere.

create or replace function public.delete_own_account(current_password text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_attempts public.password_verification_attempts%rowtype;
  v_next_failed_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_attempts
  from public.password_verification_attempts
  where user_id = auth.uid()
  for update;

  if v_attempts.locked_until is not null and v_attempts.locked_until > now() then
    return 'locked_out';
  end if;

  if not exists (
    select 1 from auth.users
    where id = auth.uid()
      and encrypted_password = extensions.crypt(current_password, encrypted_password)
  ) then
    v_next_failed_count := case
      when v_attempts.locked_until is not null and v_attempts.locked_until <= now() then 1
      else coalesce(v_attempts.failed_count, 0) + 1
    end;

    insert into public.password_verification_attempts (user_id, failed_count, locked_until, updated_at)
    values (
      auth.uid(),
      v_next_failed_count,
      case when v_next_failed_count >= 5 then now() + interval '15 minutes' else null end,
      now()
    )
    on conflict (user_id) do update
    set failed_count = excluded.failed_count,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at;

    insert into public.activity_log (user_id, action, metadata)
    values (auth.uid(), 'account_verification_failed', jsonb_build_object(
      'rpc', 'delete_own_account',
      'failed_count', v_next_failed_count,
      'locked', v_next_failed_count >= 5
    ));

    return 'incorrect_password';
  end if;

  delete from public.password_verification_attempts where user_id = auth.uid();

  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();

  return 'ok';
end;
$$;

revoke all on function public.delete_own_account(text) from public;
grant execute on function public.delete_own_account(text) to authenticated;
revoke execute on function public.delete_own_account(text) from anon;

create or replace function public.change_own_password(current_password text, new_password text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_attempts public.password_verification_attempts%rowtype;
  v_next_failed_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if new_password is null or length(new_password) < 8 then
    raise exception 'New password must be at least 8 characters';
  end if;

  select * into v_attempts
  from public.password_verification_attempts
  where user_id = auth.uid()
  for update;

  if v_attempts.locked_until is not null and v_attempts.locked_until > now() then
    return 'locked_out';
  end if;

  if not exists (
    select 1 from auth.users
    where id = auth.uid()
      and encrypted_password = extensions.crypt(current_password, encrypted_password)
  ) then
    v_next_failed_count := case
      when v_attempts.locked_until is not null and v_attempts.locked_until <= now() then 1
      else coalesce(v_attempts.failed_count, 0) + 1
    end;

    insert into public.password_verification_attempts (user_id, failed_count, locked_until, updated_at)
    values (
      auth.uid(),
      v_next_failed_count,
      case when v_next_failed_count >= 5 then now() + interval '15 minutes' else null end,
      now()
    )
    on conflict (user_id) do update
    set failed_count = excluded.failed_count,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at;

    insert into public.activity_log (user_id, action, metadata)
    values (auth.uid(), 'account_verification_failed', jsonb_build_object(
      'rpc', 'change_own_password',
      'failed_count', v_next_failed_count,
      'locked', v_next_failed_count >= 5
    ));

    return 'incorrect_password';
  end if;

  delete from public.password_verification_attempts where user_id = auth.uid();

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
