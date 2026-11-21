-- Feature flags: ship unfinished features to production switched off, turn
-- them on for specific accounts (e.g. the owner) to try them against real
-- data, then release to everyone by flipping one column.
--
--   feature_flags       one row per flag; enabled_for_all = released
--   feature_flag_users  per-account opt-ins for flags not yet released
--
-- App users can only READ the flags that are on for them (RLS below). There
-- are deliberately no insert/update/delete grants or policies for app roles:
-- flags are managed from the Supabase dashboard / SQL editor, which runs as
-- a privileged role that bypasses RLS. See "Feature flags" in README.md.
--
-- This only hides UI. Flagged code still ships in the public JS bundle, so a
-- flag must never be the thing protecting data; RLS does that, as everywhere.

create table if not exists public.feature_flags (
  key text primary key
    constraint feature_flags_key_format check (key ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  description text
    constraint feature_flags_description_length check (char_length(description) <= 500),
  enabled_for_all boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.feature_flag_users (
  flag_key text not null references public.feature_flags (key) on delete cascade on update cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (flag_key, user_id)
);

create index if not exists feature_flag_users_user_id_idx
  on public.feature_flag_users (user_id);

alter table public.feature_flags enable row level security;
alter table public.feature_flag_users enable row level security;

-- Supabase's default privileges grant everything on new public tables to
-- anon/authenticated. Strip that so a missing or mistaken policy can never
-- let a client write flags, then grant back read-only to signed-in users.
revoke all on public.feature_flags from anon, authenticated;
revoke all on public.feature_flag_users from anon, authenticated;
grant select on public.feature_flags to authenticated;
grant select on public.feature_flag_users to authenticated;

-- A user sees only their own opt-ins (not who else is opted in).
drop policy if exists "feature_flag_users_select_own" on public.feature_flag_users;
create policy "feature_flag_users_select_own" on public.feature_flag_users
  for select to authenticated
  using (user_id = (select auth.uid()));

-- A user sees a flag only if it's released or they're opted in, so the list
-- of unreleased flags isn't readable by everyone.
drop policy if exists "feature_flags_select_enabled" on public.feature_flags;
create policy "feature_flags_select_enabled" on public.feature_flags
  for select to authenticated
  using (
    enabled_for_all
    or exists (
      select 1
      from public.feature_flag_users ffu
      where ffu.flag_key = feature_flags.key
        and ffu.user_id = (select auth.uid())
    )
  );
