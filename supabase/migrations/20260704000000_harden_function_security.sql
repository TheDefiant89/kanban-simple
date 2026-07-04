-- Addresses findings from `get_advisors` (security) after applying the
-- initial schema against a live project:
--
-- 1. function_search_path_mutable: set_updated_at had no search_path pinned.
-- 2. anon/authenticated_security_definer_function_executable: every function
--    in the public schema is exposed by PostgREST as an RPC endpoint by
--    default. handle_new_user and spawn_recurring_task are trigger-only
--    functions (handle_new_user runs `after insert on auth.users`,
--    spawn_recurring_task runs `after update on tasks`) and must never be
--    invoked directly, so their public EXECUTE grant is revoked.
-- 3. delete_own_account's own migration already revokes from PUBLIC and
--    grants only to `authenticated`, but Supabase's default privileges grant
--    EXECUTE directly to the `anon` role on function creation (a direct
--    grant, not inherited via PUBLIC), so it survived that revoke. Revoke it
--    explicitly here.
--
-- Note: revoking EXECUTE from PUBLIC/anon/authenticated does not affect
-- trigger firing or `security definer` execution as the table owner —
-- triggers run under the function owner's privileges regardless of who
-- performs the DML that fires them.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.spawn_recurring_task() from public;
revoke execute on function public.delete_own_account() from anon;
