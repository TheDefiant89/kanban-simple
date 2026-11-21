-- Fill user_id from the caller's JWT on insert.
--
-- The client used to call supabase.auth.getUser() -- a network round trip to
-- the auth server -- before every insert just to send its own user id, which
-- the RLS insert policies (auth.uid() = user_id) then checked anyway. With a
-- column default the client simply omits user_id: the row gets the caller's
-- id and the existing policies still reject any explicit value that isn't
-- theirs. Inserts that set user_id explicitly (security-definer triggers such
-- as spawn_recurring_task, which copy it from the source row) are unaffected.
--
-- Must be applied before the frontend that stops sending user_id is deployed;
-- older clients that still send it keep working.

alter table public.columns   alter column user_id set default auth.uid();
alter table public.tasks     alter column user_id set default auth.uid();
alter table public.subtasks  alter column user_id set default auth.uid();
alter table public.tags      alter column user_id set default auth.uid();
alter table public.task_tags alter column user_id set default auth.uid();
