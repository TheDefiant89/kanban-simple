-- Cover the two foreign keys Supabase's performance advisor flags as
-- unindexed (lint 0001_unindexed_foreign_keys).
--
-- Without an index, deleting a referenced row makes Postgres scan the whole
-- referencing table to apply the FK action:
--   * activity_log.task_id (on delete cascade): every task delete scans
--     activity_log, which only grows.
--   * task_tags.user_id (on delete cascade): deleting an account scans
--     task_tags. The RLS policies also filter task_tags on user_id.

create index if not exists activity_log_task_id_idx
  on public.activity_log (task_id);

create index if not exists task_tags_user_id_idx
  on public.task_tags (user_id);
