-- Fixes GitHub issue #69: profiles (email/display_name/avatar_url) and
-- activity_log (action/metadata) were never given the DB-level length/size
-- caps that every other user-writable free-text column already has
-- (projects/columns #23/#27, tasks/subtasks #40, tags #23/#27, projects.slug
-- #62). Both tables have an owner-scoped RLS policy that permits direct
-- authenticated writes from the client (profiles_update_own,
-- activity_log_insert_own), so without a DB-level cap a user can write an
-- arbitrarily large value into either table via a direct PostgREST call.
--
-- Caps mirror the pattern used by the earlier length-cap migrations and
-- leave generous headroom over the values the app itself ever writes
-- (handle_new_user's `insert into public.profiles (id, email)` copies
-- auth.users.email, itself capped at 255; the recurring-task trigger's
-- activity_log insert writes a short fixed action string and a small
-- jsonb payload).

alter table public.profiles
  add constraint profiles_email_length check (char_length(email) <= 255),
  add constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 100),
  add constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048);

alter table public.activity_log
  add constraint activity_log_action_length check (char_length(action) <= 100),
  add constraint activity_log_metadata_size check (pg_column_size(metadata) <= 8192);
