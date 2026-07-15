-- Fixes #48: change_own_password updated auth.users.encrypted_password but
-- never touched auth.sessions/auth.refresh_tokens. Supabase Auth access
-- tokens are self-verifying JWTs and refresh tokens are validated by row
-- lookup, independent of the password hash, so every other active session
-- for the account -- including an attacker's stolen one -- stayed valid
-- and indefinitely renewable after the legitimate user changed their
-- password. delete_own_account doesn't have this gap: auth.sessions.user_id
-- and auth.refresh_tokens.session_id both cascade from auth.users, so
-- deleting the user row already revokes everything.
--
-- Revoke every other session for the user in the same transaction as the
-- password update, keeping the caller's own current session (identified by
-- the session_id claim in their JWT) alive. auth.refresh_tokens rows for
-- the revoked sessions cascade automatically.

create or replace function public.change_own_password(current_password text, new_password text)
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

  delete from auth.sessions
  where user_id = auth.uid()
    and id <> coalesce(nullif(auth.jwt() ->> 'session_id', ''), '00000000-0000-0000-0000-000000000000')::uuid;

  return 'ok';
end;
$$;

revoke all on function public.change_own_password(text, text) from public;
grant execute on function public.change_own_password(text, text) to authenticated;
revoke execute on function public.change_own_password(text, text) from anon;
