-- Kanban initial schema: tables, indexes, RLS policies, and the recurring
-- task engine. Designed to run once against a fresh Supabase project via
-- `supabase db push` or the SQL editor.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  color text not null default '#6366f1',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index projects_user_name_unique
  on public.projects (user_id, lower(name))
  where is_archived = false;

create index projects_user_id_idx on public.projects (user_id);

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- columns (kanban board columns)
-- ---------------------------------------------------------------------------
create table public.columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  color text not null default '#94a3b8',
  position integer not null default 0,
  is_collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index columns_project_name_unique
  on public.columns (project_id, lower(name));

create index columns_project_id_idx on public.columns (project_id);
create index columns_user_id_idx on public.columns (user_id);

create trigger set_columns_updated_at
  before update on public.columns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  column_id uuid not null references public.columns (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text,
  position integer not null default 0,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  start_date date,
  due_date date,
  completed_at timestamptz,
  is_archived boolean not null default false,
  recurrence_type text not null default 'none'
    check (recurrence_type in ('none', 'daily', 'weekly', 'monthly', 'custom')),
  recurrence_cron text,
  recurrence_parent_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_date_logic check (
    start_date is null or due_date is null or start_date <= due_date
  )
);

create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_column_id_idx on public.tasks (column_id);
create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_due_date_idx on public.tasks (due_date);
create index tasks_recurrence_parent_idx on public.tasks (recurrence_parent_id);

create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subtasks
-- ---------------------------------------------------------------------------
create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  is_completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subtasks_task_id_idx on public.subtasks (task_id);
create index subtasks_user_id_idx on public.subtasks (user_id);

create trigger set_subtasks_updated_at
  before update on public.subtasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tags_user_name_unique on public.tags (user_id, lower(name));
create index tags_user_id_idx on public.tags (user_id);

create trigger set_tags_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- task_tags (many-to-many join)
-- ---------------------------------------------------------------------------
create table public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, tag_id)
);

create index task_tags_task_id_idx on public.task_tags (task_id);
create index task_tags_tag_id_idx on public.task_tags (tag_id);

-- ---------------------------------------------------------------------------
-- activity_log
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_user_id_idx on public.activity_log (user_id);
create index activity_log_project_id_idx on public.activity_log (project_id);
create index activity_log_created_at_idx on public.activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Recurring task engine
--
-- When a task's completed_at transitions from null to a timestamp and the
-- task has a recurrence_type other than 'none', spawn a new task in the same
-- column with dates shifted forward. The completed task itself is left
-- untouched so its completion history is retained. This trigger is a
-- lightweight, synchronous stand-in for a Supabase Edge Function / scheduled
-- job that could later own more sophisticated cron handling.
-- ---------------------------------------------------------------------------
create or replace function public.spawn_recurring_task()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  next_start date;
  next_due date;
  day_shift integer;
begin
  if new.completed_at is not null
     and old.completed_at is null
     and new.recurrence_type <> 'none' then

    day_shift := case new.recurrence_type
      when 'daily' then 1
      when 'weekly' then 7
      when 'monthly' then 30
      else 1 -- 'custom': best-effort daily fallback until cron parsing is handled server-side
    end;

    if new.recurrence_type = 'monthly' then
      next_start := case when new.start_date is not null then new.start_date + interval '1 month' end;
      next_due := case when new.due_date is not null then new.due_date + interval '1 month' end;
    else
      next_start := case when new.start_date is not null then new.start_date + day_shift end;
      next_due := case when new.due_date is not null then new.due_date + day_shift end;
    end if;

    insert into public.tasks (
      project_id, column_id, user_id, title, description, position,
      priority, start_date, due_date, recurrence_type, recurrence_cron,
      recurrence_parent_id
    ) values (
      new.project_id, new.column_id, new.user_id, new.title, new.description, new.position,
      new.priority, next_start, next_due, new.recurrence_type, new.recurrence_cron,
      coalesce(new.recurrence_parent_id, new.id)
    );

    insert into public.activity_log (user_id, project_id, task_id, action, metadata)
    values (new.user_id, new.project_id, new.id, 'recurring_task_completed',
      jsonb_build_object('recurrence_type', new.recurrence_type));
  end if;

  return new;
end;
$$;

create trigger tasks_spawn_recurring
  after update on public.tasks
  for each row execute function public.spawn_recurring_task();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.columns enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.activity_log enable row level security;

-- profiles: a user may only see/edit their own profile row.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- projects
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- columns
create policy "columns_select_own" on public.columns
  for select using (auth.uid() = user_id);
create policy "columns_insert_own" on public.columns
  for insert with check (auth.uid() = user_id);
create policy "columns_update_own" on public.columns
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "columns_delete_own" on public.columns
  for delete using (auth.uid() = user_id);

-- tasks
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- subtasks
create policy "subtasks_select_own" on public.subtasks
  for select using (auth.uid() = user_id);
create policy "subtasks_insert_own" on public.subtasks
  for insert with check (auth.uid() = user_id);
create policy "subtasks_update_own" on public.subtasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subtasks_delete_own" on public.subtasks
  for delete using (auth.uid() = user_id);

-- tags
create policy "tags_select_own" on public.tags
  for select using (auth.uid() = user_id);
create policy "tags_insert_own" on public.tags
  for insert with check (auth.uid() = user_id);
create policy "tags_update_own" on public.tags
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tags_delete_own" on public.tags
  for delete using (auth.uid() = user_id);

-- task_tags
create policy "task_tags_select_own" on public.task_tags
  for select using (auth.uid() = user_id);
create policy "task_tags_insert_own" on public.task_tags
  for insert with check (auth.uid() = user_id);
create policy "task_tags_delete_own" on public.task_tags
  for delete using (auth.uid() = user_id);

-- activity_log: append-only from the client's perspective.
create policy "activity_log_select_own" on public.activity_log
  for select using (auth.uid() = user_id);
create policy "activity_log_insert_own" on public.activity_log
  for insert with check (auth.uid() = user_id);
