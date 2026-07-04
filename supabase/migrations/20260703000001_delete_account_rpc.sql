-- RPC allowing an authenticated user to delete their own account and all
-- owned data. App data (projects, columns, tasks, subtasks, tags,
-- task_tags, activity_log) cascades from the profiles row via foreign keys
-- declared with `on delete cascade` in the initial schema.
--
-- Deleting the auth.users row itself requires elevated privileges. This
-- function is defined with `security definer` and owned by the `postgres`
-- role, which on Supabase-managed projects has sufficient rights over the
-- `auth` schema to perform the delete. If you run this against a
-- self-hosted stack where that is not true, delete the auth user instead
-- via the Supabase Admin API / service role key from a trusted server
-- context (e.g. an Edge Function), and drop the final `delete from auth.users`
-- statement below.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.profiles where id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
