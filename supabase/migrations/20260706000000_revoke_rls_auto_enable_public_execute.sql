-- Addresses findings from `get_advisors` (security):
--
-- anon/authenticated_security_definer_function_executable: public.rls_auto_enable()
-- is a SECURITY DEFINER event-trigger function (installed on the project outside
-- this repo's migration history — likely via a dashboard/platform "auto-enable RLS
-- on new tables" toggle rather than a tracked migration) that PostgREST exposes as
-- an RPC endpoint by default, same as any other public-schema function.
--
-- It `returns event_trigger`, a pseudo-type Postgres only allows to run inside real
-- event-trigger firing, so invoking it directly via `/rest/v1/rpc/rls_auto_enable`
-- cannot execute its body meaningfully. Revoking the public EXECUTE grant closes
-- the flagged advisor warning and matches the hardening already applied to other
-- trigger-only functions in `20260704000000_harden_function_security.sql` — revoking
-- EXECUTE from PUBLIC/anon/authenticated does not affect event-trigger firing, which
-- runs under the function owner's privileges regardless of who performs the DDL.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;
