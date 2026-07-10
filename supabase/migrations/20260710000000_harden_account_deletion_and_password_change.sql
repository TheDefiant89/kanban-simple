-- Closes #33: the client-side "re-verify current password" step
-- (reauthenticateWithPassword(), a discarded signInWithPassword() call)
-- added by #3 never produced anything the server-side calls it precedes
-- could check. Both delete_own_account() and password changes
-- (supabase.auth.updateUser()) accepted any valid session with no proof
-- reauthentication occurred, so calling either endpoint directly (skipping
-- the app UI) bypassed the control entirely.
--
-- Both destructive actions now require current_password and verify it
-- server-side via pgcrypto (already enabled, installed in the `extensions`
-- schema) against auth.users.encrypted_password before doing anything.

drop function if exists public.delete_own_account();

create or replace function public.delete_own_account(current_password text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from auth.users
    where id = auth.uid()
      and encrypted_password = extensions.crypt(current_password, encrypted_password)
  ) then
    raise exception 'Incorrect password';
  end if;

  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account(text) from public;
grant execute on function public.delete_own_account(text) to authenticated;
revoke execute on function public.delete_own_account(text) from anon;

-- New RPC replacing the changePassword() service's reliance on
-- supabase.auth.updateUser(), which has no "verify current password"
-- parameter. Writes directly to auth.users.encrypted_password using the
-- same bcrypt scheme GoTrue already uses there (confirmed live: existing
-- hashes are $2a$-prefixed, 60 chars).
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

  if not exists (
    select 1 from auth.users
    where id = auth.uid()
      and encrypted_password = extensions.crypt(current_password, encrypted_password)
  ) then
    raise exception 'Incorrect password';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.change_own_password(text, text) from public;
grant execute on function public.change_own_password(text, text) to authenticated;
revoke execute on function public.change_own_password(text, text) from anon;
