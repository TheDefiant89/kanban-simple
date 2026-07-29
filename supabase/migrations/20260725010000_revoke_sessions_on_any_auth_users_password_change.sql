-- Partially addresses GitHub issue #61: change_own_password
-- (20260714000000) revokes every other session when the password changes
-- through OUR RPC, but Supabase Auth's native `PUT /auth/v1/user`
-- endpoint (used by the recovery flow via updatePassword() in
-- src/services/auth.ts, and reachable directly by anyone holding a valid
-- access token) updates auth.users.encrypted_password through GoTrue --
-- a path that never touches the RPC, so a password change made there left
-- every other session (including a stolen one) fully valid, defeating the
-- same "change your password to recover from a compromised session"
-- guarantee #48/#61 rely on.
--
-- This does NOT add a current-password check to the native endpoint --
-- that has to be enforced inside GoTrue itself (outside Postgres/
-- PostgREST) and isn't something a migration can express; see #61 for
-- that remaining gap, which stays open. This closes only the
-- session-persistence half of #61 by moving revoke-other-sessions
-- out of the RPC and into a trigger on auth.users, so it fires for *any*
-- caller that changes the password hash -- the RPC, the native endpoint,
-- or the dashboard -- not just the one code path the RPC covers.
create or replace function public.revoke_other_sessions_on_password_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from auth.sessions
  where user_id = new.id
    and id <> coalesce(nullif(auth.jwt() ->> 'session_id', ''), '00000000-0000-0000-0000-000000000000')::uuid;
  return new;
end;
$$;

create trigger revoke_other_sessions_on_password_change
  after update on auth.users
  for each row
  when (new.encrypted_password is distinct from old.encrypted_password)
  execute function public.revoke_other_sessions_on_password_change();

-- change_own_password's own explicit revoke-other-sessions delete (added
-- by 20260714000000) is now redundant with this trigger -- the trigger
-- fires first, on the UPDATE inside that same function -- but it's a
-- harmless no-op left in place rather than removed, since it does no harm
-- and keeps that function correct standalone.
