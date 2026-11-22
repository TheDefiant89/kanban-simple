-- Notes: markdown notes grouped by [[wikilinks]], convertible into tasks.
--
-- 1. public.notes. One row per note, owned by a user (not a project: notes
--    are a personal notebook that can feed any board). A note's place in
--    the notes tree isn't stored -- the client derives it from the first
--    [[Title]] link in the note's content, which names its parent. Titles
--    are therefore unique per user (case-insensitive, like tags) and may
--    not contain the characters that delimit a link: [ ] | # or a line
--    break.
--
-- 2. Renames keep the tree intact. When a note's title changes, every
--    [[Old title]] link in the user's other notes is rewritten to the new
--    title (aliases [[Old|shown]] and heading links [[Old#h]] included), and
--    tasks/subtasks created from the note follow the rename -- unless their
--    title was edited by hand since, in which case it's left alone.
--
-- 3. tasks.note_id / subtasks.note_id link a task (from a parent note) and
--    its subtasks (from the child notes) back to their notes. Deleting a
--    note keeps the tasks and just unlinks them. A trigger rejects a
--    note_id the row's owner doesn't own, the same guarantee the hardened
--    FK policies give project_id/column_id.
--
-- 4. convert_note_to_task / sync_note_task_subtasks do the conversion in
--    one transaction each. The client passes the child note ids (it owns
--    the link parsing); each id is checked against the caller's notes.
--
-- Everything is SECURITY INVOKER with a pinned search_path, so reads and
-- writes go through the caller's RLS policies.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_title_not_blank check (char_length(trim(title)) > 0),
  constraint notes_title_length check (char_length(title) <= 200),
  constraint notes_title_chars check (title !~ '[][|#\r\n]'),
  constraint notes_content_length check (char_length(content) <= 100000)
);

create unique index notes_user_title_unique on public.notes (user_id, lower(title));

create trigger set_notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

create policy "notes_select_own" on public.notes
  for select using ((select auth.uid()) = user_id);
create policy "notes_insert_own" on public.notes
  for insert with check ((select auth.uid()) = user_id);
create policy "notes_update_own" on public.notes
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notes_delete_own" on public.notes
  for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Task / subtask links
-- ---------------------------------------------------------------------------
alter table public.tasks add column note_id uuid references public.notes (id) on delete set null;
alter table public.subtasks add column note_id uuid references public.notes (id) on delete set null;

create index tasks_note_id_idx on public.tasks (note_id) where note_id is not null;
create index subtasks_note_id_idx on public.subtasks (note_id) where note_id is not null;

create or replace function public.check_note_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.note_id is not null and not exists (
    select 1 from public.notes n where n.id = new.note_id and n.user_id = new.user_id
  ) then
    raise exception 'Note not found' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.check_note_ownership() from public, anon, authenticated;

create trigger tasks_check_note_ownership
  before insert or update of note_id on public.tasks
  for each row execute function public.check_note_ownership();

create trigger subtasks_check_note_ownership
  before insert or update of note_id on public.subtasks
  for each row execute function public.check_note_ownership();

-- ---------------------------------------------------------------------------
-- Renames
-- ---------------------------------------------------------------------------
create or replace function public.propagate_note_rename()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Titles can't contain [ ] | #, but may contain other regex
  -- metacharacters (". ( ) + ?"), so escape the old one for the pattern
  -- and backslashes in the new one for the replacement.
  old_pattern text := regexp_replace(old.title, '([.^$*+?(){}\\-])', '\\\1', 'g');
  new_text text := replace(new.title, '\', '\\');
  link_pattern text := '\[\[\s*' || old_pattern || '\s*(\||#|\]\])';
begin
  update public.notes
  set content = regexp_replace(content, link_pattern, '[[' || new_text || '\1', 'gi')
  where user_id = new.user_id
    and id <> new.id
    and content ~* link_pattern;

  update public.tasks
  set title = left(new.title, 200)
  where note_id = new.id and user_id = new.user_id and title = left(old.title, 200);

  update public.subtasks
  set title = left(new.title, 200)
  where note_id = new.id and user_id = new.user_id and title = left(old.title, 200);

  return null;
end;
$$;

revoke all on function public.propagate_note_rename() from public, anon, authenticated;

create trigger notes_propagate_rename
  after update of title on public.notes
  for each row
  when (old.title is distinct from new.title)
  execute function public.propagate_note_rename();

-- ---------------------------------------------------------------------------
-- Conversion RPCs
-- ---------------------------------------------------------------------------

-- Creates a task from p_note_id at the bottom of p_column_id, with one
-- subtask per id in p_child_note_ids (in the order given). Returns the new
-- task's id.
create or replace function public.convert_note_to_task(
  p_note_id uuid,
  p_column_id uuid,
  p_child_note_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  src public.notes;
  col public.columns;
  new_task_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if coalesce(array_length(p_child_note_ids, 1), 0) > 500 then
    raise exception 'Too many sub-notes (max 500)' using errcode = '22023';
  end if;

  select * into src from notes where id = p_note_id and user_id = uid;
  if not found then
    raise exception 'Note not found' using errcode = 'P0002';
  end if;

  select * into col from columns where id = p_column_id and user_id = uid;
  if not found then
    raise exception 'Column not found' using errcode = 'P0002';
  end if;

  insert into tasks (project_id, column_id, user_id, title, position, note_id)
  values (
    col.project_id, col.id, uid, left(src.title, 200),
    coalesce((select max(t.position) + 1 from tasks t where t.column_id = col.id), 0),
    src.id
  )
  returning id into new_task_id;

  insert into subtasks (task_id, user_id, title, position, note_id)
  select new_task_id, uid, left(n.title, 200), (c.ord - 1)::int, n.id
  from unnest(p_child_note_ids) with ordinality as c (id, ord)
  join notes n on n.id = c.id and n.user_id = uid
  where n.id <> src.id
  order by c.ord;

  return new_task_id;
end;
$$;

-- Adds a subtask to p_task_id for each child note not already linked to
-- one of its subtasks, after the existing subtasks. Returns how many were
-- added.
create or replace function public.sync_note_task_subtasks(
  p_task_id uuid,
  p_child_note_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  src public.tasks;
  start_pos integer;
  added integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if coalesce(array_length(p_child_note_ids, 1), 0) > 500 then
    raise exception 'Too many sub-notes (max 500)' using errcode = '22023';
  end if;

  select * into src from tasks where id = p_task_id and user_id = uid;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  select coalesce(max(s.position) + 1, 0) into start_pos
  from subtasks s where s.task_id = src.id;

  insert into subtasks (task_id, user_id, title, position, note_id)
  select src.id, uid, left(n.title, 200),
         start_pos + (row_number() over (order by c.ord))::int - 1, n.id
  from unnest(p_child_note_ids) with ordinality as c (id, ord)
  join notes n on n.id = c.id and n.user_id = uid
  where n.id is distinct from src.note_id
    and not exists (
      select 1 from subtasks s where s.task_id = src.id and s.note_id = n.id
    );

  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.convert_note_to_task(uuid, uuid, uuid[]) from public;
revoke execute on function public.convert_note_to_task(uuid, uuid, uuid[]) from anon;
grant execute on function public.convert_note_to_task(uuid, uuid, uuid[]) to authenticated;

revoke all on function public.sync_note_task_subtasks(uuid, uuid[]) from public;
revoke execute on function public.sync_note_task_subtasks(uuid, uuid[]) from anon;
grant execute on function public.sync_note_task_subtasks(uuid, uuid[]) to authenticated;
