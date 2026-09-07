-- ---------------------------------------------------------------------------
-- Honour custom cron recurrence when spawning the next task occurrence.
--
-- Previously `spawn_recurring_task` treated the `custom` recurrence type as a
-- best-effort daily shift: completing a task with a cron expression such as
-- `0 0 1 */3 *` simply moved the dates forward by one day, ignoring the
-- pattern entirely. This migration adds a small cron parser so the next
-- occurrence lands on the next date that actually matches the expression.
--
-- Tasks are date-based (start_date / due_date are `date`, there is no
-- time-of-day), so only the day-of-month, month and day-of-week fields drive
-- scheduling; the minute and hour fields are parsed for validity but do not
-- affect which date is chosen. Standard Vixie-cron semantics are used: when
-- both the day-of-month and day-of-week fields are restricted (not `*`), a
-- date matches if it satisfies EITHER field.
-- ---------------------------------------------------------------------------

-- Expand a single cron field (e.g. `*/3`, `1-5`, `0,15,30`, `5/2`) into the
-- concrete set of integers it covers within [fmin, fmax]. Returns NULL when
-- the field is syntactically invalid or references values out of range, so
-- callers can reject the whole expression.
create or replace function public.expand_cron_field(field text, fmin int, fmax int)
returns int[]
language plpgsql
immutable
set search_path = public
as $$
declare
  result int[] := array[]::int[];
  part text;
  base text;
  step_text text;
  step int;
  lo int;
  hi int;
  v int;
begin
  if field is null then
    return null;
  end if;
  field := btrim(field);
  if field = '' then
    return null;
  end if;

  foreach part in array string_to_array(field, ',')
  loop
    part := btrim(part);
    if part = '' then
      return null;
    end if;

    -- Optional step: `base/step`.
    if position('/' in part) > 0 then
      base := btrim(split_part(part, '/', 1));
      step_text := btrim(split_part(part, '/', 2));
      if step_text !~ '^\d+$' then
        return null;
      end if;
      step := step_text::int;
      if step <= 0 then
        return null;
      end if;
    else
      base := part;
      step := 1;
    end if;

    if base = '*' then
      lo := fmin;
      hi := fmax;
    elsif position('-' in base) > 0 then
      if split_part(base, '-', 1) !~ '^\d+$' or split_part(base, '-', 2) !~ '^\d+$' then
        return null;
      end if;
      lo := split_part(base, '-', 1)::int;
      hi := split_part(base, '-', 2)::int;
    else
      if base !~ '^\d+$' then
        return null;
      end if;
      lo := base::int;
      -- A bare number with a step (e.g. `5/2`) runs from that number to fmax.
      if step > 1 then
        hi := fmax;
      else
        hi := lo;
      end if;
    end if;

    if lo < fmin or hi > fmax or lo > hi then
      return null;
    end if;

    v := lo;
    while v <= hi loop
      result := result || v;
      v := v + step;
    end loop;
  end loop;

  return result;
end;
$$;

-- Return the first date strictly after `after` that matches the (5-field)
-- cron expression, considering only the day-of-month, month and day-of-week
-- fields. Returns NULL when the expression is invalid or no match is found
-- within a ~4-year horizon.
create or replace function public.next_cron_date(cron text, after date)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  fields text[];
  months int[];
  doms int[];
  dows int[];
  dom_restricted boolean;
  dow_restricted boolean;
  candidate date;
  guard int := 0;
  cur_dow int;
  dom_ok boolean;
  dow_ok boolean;
begin
  if cron is null or after is null then
    return null;
  end if;

  fields := regexp_split_to_array(btrim(cron), '\s+');
  if array_length(fields, 1) is distinct from 5 then
    return null;
  end if;

  -- fields: minute hour day-of-month month day-of-week
  -- Validate the minute/hour fields too (they must parse) even though they
  -- do not influence a date-only schedule.
  if expand_cron_field(fields[1], 0, 59) is null then
    return null;
  end if;
  if expand_cron_field(fields[2], 0, 23) is null then
    return null;
  end if;

  months := expand_cron_field(fields[4], 1, 12);
  doms := expand_cron_field(fields[3], 1, 31);
  dows := expand_cron_field(fields[5], 0, 7);

  if months is null or doms is null or dows is null then
    return null;
  end if;

  -- Cron day-of-week allows 0-7 where both 0 and 7 mean Sunday; Postgres
  -- extract(dow) yields 0 (Sun) .. 6 (Sat), so fold 7 down to 0.
  dows := (select array_agg(distinct case when d = 7 then 0 else d end) from unnest(dows) as d);

  dom_restricted := btrim(fields[3]) <> '*';
  dow_restricted := btrim(fields[5]) <> '*';

  candidate := after + 1;
  loop
    guard := guard + 1;
    exit when guard > 1500; -- ~4 years; give up rather than loop forever

    if extract(month from candidate)::int = any(months) then
      dom_ok := extract(day from candidate)::int = any(doms);
      cur_dow := extract(dow from candidate)::int;
      dow_ok := cur_dow = any(dows);

      if dom_restricted and dow_restricted then
        if dom_ok or dow_ok then
          return candidate;
        end if;
      elsif dom_ok and dow_ok then
        return candidate;
      end if;
    end if;

    candidate := candidate + 1;
  end loop;

  return null;
end;
$$;

-- Rewrite the recurrence trigger so `custom` uses the cron parser above.
create or replace function public.spawn_recurring_task()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  next_start date;
  next_due date;
  day_shift integer;
  anchor date;
  next_anchor date;
begin
  if new.completed_at is not null
     and old.completed_at is null
     and new.recurrence_type <> 'none' then

    if new.recurrence_type = 'custom'
       and nullif(btrim(coalesce(new.recurrence_cron, '')), '') is not null then

      -- Anchor on the due date (the scheduling date), falling back to the
      -- start date and then the completion date, so a cron task still gets a
      -- concrete next date even if it had no dates set.
      anchor := coalesce(
        new.due_date,
        new.start_date,
        (new.completed_at at time zone 'UTC')::date
      );
      next_anchor := next_cron_date(new.recurrence_cron, anchor);

      if next_anchor is not null then
        if new.due_date is not null then
          next_due := next_anchor;
          -- Preserve the original start -> due offset.
          if new.start_date is not null then
            next_start := new.start_date + (next_anchor - new.due_date);
          end if;
        elsif new.start_date is not null then
          next_start := next_anchor;
        else
          next_due := next_anchor;
        end if;
      else
        -- Unparseable cron: fall back to a daily shift so the task keeps
        -- recurring rather than silently stopping.
        next_start := case when new.start_date is not null then new.start_date + 1 end;
        next_due := case when new.due_date is not null then new.due_date + 1 end;
      end if;

    else
      day_shift := case new.recurrence_type
        when 'daily' then 1
        when 'weekly' then 7
        when 'monthly' then 30
        else 1
      end;

      if new.recurrence_type = 'monthly' then
        next_start := case when new.start_date is not null then new.start_date + interval '1 month' end;
        next_due := case when new.due_date is not null then new.due_date + interval '1 month' end;
      else
        next_start := case when new.start_date is not null then new.start_date + day_shift end;
        next_due := case when new.due_date is not null then new.due_date + day_shift end;
      end if;
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

-- These helpers touch no tables, but like every function in the public schema
-- they are exposed by PostgREST as RPC endpoints by default. They are only
-- ever called from within spawn_recurring_task (a security definer trigger
-- running as the table owner, which retains EXECUTE regardless), so revoke the
-- default public grants to keep them off the API surface.
revoke execute on function public.expand_cron_field(text, int, int) from public;
revoke execute on function public.next_cron_date(text, date) from public;
revoke execute on function public.spawn_recurring_task() from public;
