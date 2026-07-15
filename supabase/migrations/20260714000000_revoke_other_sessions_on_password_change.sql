-- Closes #48: change_own_password verifies current_password and overwrites
-- auth.users.encrypted_password, but never touched auth.sessions or
-- auth.refresh_tokens. Supabase Auth sessions are independent of the
-- password hash -- access tokens are self-verifying JWTs, and refresh
-- tokens are looked up by row in auth.refresh_tokens/auth.sessions, not by
-- re-checking the password -- so every other active session for the
-- account, including an attacker's stolen one, remained fully valid and
-- indefinitely renewable after the legitimate user changed their password.
-- That defeats the standard "if you think you've been compromised, change
-- your password" incident-response step for exactly the stolen-session
-- threat model #33/#35/#45 already hardened this RPC against.
--
-- change_own_password now revokes every *other* session for the user in
-- the same transaction as the password update. auth.refresh_tokens.session_id
-- references auth.sessions.id on delete cascade (confirmed live), so
-- deleting the session row also invalidates its refresh token. The
-- caller's own session -- identified via the session_id claim GoTrue puts
-- in every access token -- is left alone so changing your own password
-- doesn't also log you out.
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
