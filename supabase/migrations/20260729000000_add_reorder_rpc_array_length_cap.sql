-- Closes #75: reorder_tasks/reorder_columns (20260705000003_add_reorder_rpcs.sql)
-- accept an arbitrary-length jsonb array with no size cap, unlike every other
-- user-writable payload in this schema (#23, #27, #40, #62, #69). RLS/ownership
-- still prevents any cross-user write, but jsonb_array_elements(updates) must
-- expand and evaluate every element before the ownership predicate filters
-- rows, so an authenticated caller can force Postgres to evaluate an
-- arbitrarily large array by calling the RPC directly (bypassing the UI,
-- which only ever sends as many entries as visible tasks/columns in the
-- dragged column/board). 500 is a generous bound -- realistic boards have far
-- fewer columns/tasks than that per drag operation.
--
-- language sql -> plpgsql is required to add the guard clause before the
-- update runs.

create or replace function public.reorder_tasks(updates jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_array_length(updates) > 500 then
    raise exception 'Too many updates in one request';
  end if;

  update tasks t
  set position = (u->>'position')::int,
      column_id = coalesce((u->>'column_id')::uuid, t.column_id)
  from jsonb_array_elements(updates) as u
  where t.id = (u->>'id')::uuid
    and t.user_id = auth.uid();
end;
$$;

create or replace function public.reorder_columns(updates jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_array_length(updates) > 500 then
    raise exception 'Too many updates in one request';
  end if;

  update columns c
  set position = (u->>'position')::int
  from jsonb_array_elements(updates) as u
  where c.id = (u->>'id')::uuid
    and c.user_id = auth.uid();
end;
$$;

revoke all on function public.reorder_tasks(jsonb) from public;
revoke execute on function public.reorder_tasks(jsonb) from anon;
grant execute on function public.reorder_tasks(jsonb) to authenticated;

revoke all on function public.reorder_columns(jsonb) from public;
revoke execute on function public.reorder_columns(jsonb) from anon;
grant execute on function public.reorder_columns(jsonb) to authenticated;
