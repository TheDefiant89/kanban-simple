-- Batch reorder RPCs: drag-and-drop reordering previously issued one
-- UPDATE request per changed row (dozens per drop on large columns).
-- These take the full set of position writes as jsonb and apply them in
-- a single statement, i.e. one HTTP round trip per drop.
--
-- security invoker (the default) so RLS on tasks/columns still governs
-- every row — including the hardened cross-user column_id ownership
-- checks; the explicit user_id predicate is defense-in-depth only.
-- search_path is pinned and EXECUTE is limited to `authenticated`, per
-- the conventions established in harden_function_security.

create or replace function public.reorder_tasks(updates jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  update tasks t
  set position = (u->>'position')::int,
      column_id = coalesce((u->>'column_id')::uuid, t.column_id)
  from jsonb_array_elements(updates) as u
  where t.id = (u->>'id')::uuid
    and t.user_id = auth.uid();
$$;

create or replace function public.reorder_columns(updates jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  update columns c
  set position = (u->>'position')::int
  from jsonb_array_elements(updates) as u
  where c.id = (u->>'id')::uuid
    and c.user_id = auth.uid();
$$;

revoke all on function public.reorder_tasks(jsonb) from public;
revoke execute on function public.reorder_tasks(jsonb) from anon;
grant execute on function public.reorder_tasks(jsonb) to authenticated;

revoke all on function public.reorder_columns(jsonb) from public;
revoke execute on function public.reorder_columns(jsonb) from anon;
grant execute on function public.reorder_columns(jsonb) to authenticated;
