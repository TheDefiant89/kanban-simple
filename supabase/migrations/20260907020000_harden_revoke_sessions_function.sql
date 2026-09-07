-- Follow-up to 20260725010000_revoke_sessions_on_any_auth_users_password_change.sql
-- (merged in #67): that migration created public.revoke_other_sessions_on_password_change()
-- but, like every function in the public schema, it is exposed by PostgREST as
-- an RPC endpoint (/rest/v1/rpc/...) by default. get_advisors flagged it as a
-- SECURITY DEFINER function executable by anon/authenticated
-- (0028/0029_*_security_definer_function_executable).
--
-- It is trigger-only — it runs from the AFTER UPDATE trigger on auth.users and
-- returns `trigger`, so a direct RPC call errors ("trigger functions can only
-- be called as triggers") before its DELETE can run and is not exploitable —
-- but it should still be off the public API surface, exactly as
-- 20260704000000_harden_function_security.sql did for the handle_new_user and
-- spawn_recurring_task trigger functions. Revoking EXECUTE does not affect
-- trigger firing: the trigger runs as the function owner regardless of who
-- performs the DML. Supabase grants EXECUTE directly to anon on creation (a
-- direct grant, not via PUBLIC), so revoke from anon and authenticated
-- explicitly as well as PUBLIC.

revoke execute on function public.revoke_other_sessions_on_password_change() from public;
revoke execute on function public.revoke_other_sessions_on_password_change() from anon;
revoke execute on function public.revoke_other_sessions_on_password_change() from authenticated;
