import { useCallback, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { patchOptimistically, queryKeys, rollback } from "@/lib/query-client";
import type { Column, ColumnWithTasks, Tag, Task, TaskWithRelations } from "@/types";
import { createColumn, deleteColumn, reorderColumns, updateColumn } from "@/services/columns";
import {
  createTask,
  deleteTask,
  duplicateTask,
  listTasks,
  reorderTasks,
  updateTask,
  updateTaskTags,
  type UpdateTaskInput,
} from "@/services/tasks";
import { listColumns } from "@/services/columns";
import { getProject, getProjectBySlug } from "@/services/projects";
import { nextPosition, TEMP_TASK_PREFIX } from "@/features/board/quick-add";
import { diffTags, spawnsNextOccurrence } from "@/features/board/task-updates";

export function useProjectBySlug(slug: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.projectBySlug(slug),
    queryFn: async () => {
      const project = await getProjectBySlug(slug);
      // Seed the by-id project cache so useBoardData doesn't re-fetch the
      // exact same row a second time on board load.
      queryClient.setQueryData(queryKeys.project(project.id), project);
      return project;
    },
    enabled: !!slug,
  });
}

export function useBoardData(projectId: string) {
  const projectQuery = useQuery({
    queryKey: queryKeys.project(projectId),
    queryFn: () => getProject(projectId),
    enabled: !!projectId,
  });

  const columnsQuery = useQuery({
    queryKey: queryKeys.columns(projectId),
    queryFn: () => listColumns(projectId),
    enabled: !!projectId,
  });

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(projectId),
    queryFn: () => listTasks(projectId),
    enabled: !!projectId,
  });

  // Single-pass, memoised join. Stable identities let downstream memos and
  // React.memo components skip work when nothing actually changed.
  const columns: ColumnWithTasks[] = useMemo(() => {
    const tasksByColumn = new Map<string, TaskWithRelations[]>();
    for (const task of tasksQuery.data ?? []) {
      const bucket = tasksByColumn.get(task.column_id);
      if (bucket) bucket.push(task);
      else tasksByColumn.set(task.column_id, [task]);
    }
    for (const bucket of tasksByColumn.values()) {
      bucket.sort((a, b) => a.position - b.position);
    }
    return [...(columnsQuery.data ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((column) => ({ ...column, tasks: tasksByColumn.get(column.id) ?? [] }));
  }, [columnsQuery.data, tasksQuery.data]);

  return {
    project: projectQuery.data,
    columns,
    isLoading: projectQuery.isLoading || columnsQuery.isLoading || tasksQuery.isLoading,
    error: projectQuery.error || columnsQuery.error || tasksQuery.error,
  };
}

type TaskList = TaskWithRelations[];

/**
 * Direct access to a board's cached task list, for edits whose result is
 * fully known client-side (e.g. subtask changes) and so need no re-fetch.
 */
export function useTaskCache(projectId: string) {
  const queryClient = useQueryClient();
  return useMemo(() => {
    const key = queryKeys.tasks(projectId);
    return {
      patchTask: (taskId: string, fn: (task: TaskWithRelations) => TaskWithRelations) =>
        queryClient.setQueryData<TaskList>(key, (old) =>
          old?.map((t) => (t.id === taskId ? fn(t) : t))
        ),
      invalidate: () => queryClient.invalidateQueries({ queryKey: key }),
    };
  }, [queryClient, projectId]);
}

export function useColumnMutations(projectId: string) {
  const queryClient = useQueryClient();
  const columnsKey = queryKeys.columns(projectId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: columnsKey });

  const create = useMutation({
    mutationFn: createColumn,
    onSuccess: invalidate,
    meta: { errorMessage: "Failed to create column" },
  });

  // Optimistic: collapse toggles and renames apply instantly instead of
  // waiting a full round trip + refetch.
  const update = useMutation({
    mutationFn: ({ columnId, updates }: { columnId: string; updates: Partial<Column> }) =>
      updateColumn(columnId, updates),
    onMutate: ({ columnId, updates }) =>
      patchOptimistically<Column[]>(queryClient, columnsKey, (old) =>
        old.map((c) => (c.id === columnId ? { ...c, ...updates } : c))
      ),
    onError: (_error, _vars, context) => rollback(queryClient, columnsKey, context),
    onSettled: invalidate,
    meta: { errorMessage: "Failed to update column" },
  });

  const remove = useMutation({
    mutationFn: deleteColumn,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      toast.success("Column deleted");
    },
    meta: { errorMessage: "Failed to delete column" },
  });

  const reorder = useMutation({
    mutationFn: reorderColumns,
    onMutate: (updates) => {
      const positions = new Map(updates.map((u) => [u.id, u.position]));
      return patchOptimistically<Column[]>(queryClient, columnsKey, (old) =>
        old.map((c) => {
          const position = positions.get(c.id);
          return position === undefined ? c : { ...c, position };
        })
      );
    },
    onError: (_error, _vars, context) => {
      rollback(queryClient, columnsKey, context);
      invalidate();
    },
    meta: { errorMessage: "Failed to reorder columns" },
  });

  return { create, update, remove, reorder };
}

export function useTaskMutations(projectId: string) {
  const queryClient = useQueryClient();
  const tasksKey = queryKeys.tasks(projectId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: tasksKey });

  /**
   * Writes a saved row into the cache in place (keeping its loaded subtasks
   * and tags unless new tags are given), or re-fetches when the save had
   * server-side effects beyond the row itself.
   */
  const applySavedRow = (before: TaskWithRelations, row: Task, tagIds?: string[]) => {
    // Resolve the new tag set from what's loaded; a tag created moments ago
    // may not be in the tags query yet, in which case re-fetch instead.
    let tags: Tag[] | undefined;
    if (tagIds) {
      const known = new Map(
        [...(queryClient.getQueryData<Tag[]>(queryKeys.tags) ?? []), ...before.tags].map((t) => [
          t.id,
          t,
        ])
      );
      tags = tagIds.map((id) => known.get(id)).filter((t): t is Tag => !!t);
      if (tags.length !== tagIds.length) {
        invalidate();
        return;
      }
    }
    if (spawnsNextOccurrence(before, row)) {
      invalidate();
      return;
    }
    queryClient.setQueryData<TaskList>(tasksKey, (old) =>
      row.is_archived
        ? old?.filter((t) => t.id !== row.id) // the board lists active tasks only
        : old?.map((t) => (t.id === row.id ? { ...t, ...row, tags: tags ?? t.tags } : t))
    );
  };

  // A new row may shift its neighbours (make_room_for_task_position), so
  // creates and duplicates re-fetch rather than patching the cache.
  // Settled, not success: if the task saved but its tags or subtasks
  // didn't, the board still has to show it.
  const create = useMutation({
    mutationFn: createTask,
    onSettled: invalidate,
    meta: { errorMessage: "Failed to create task" },
  });

  // Saves the task row and, when `tagIds` is given, its tag links -- both in
  // parallel, tags as a diff (nothing is written if they're unchanged).
  const update = useMutation({
    mutationFn: async ({
      task,
      updates,
      tagIds,
    }: {
      task: TaskWithRelations;
      updates: UpdateTaskInput;
      tagIds?: string[];
    }) => {
      const change = tagIds ? diffTags(task.tags, tagIds) : null;
      const [row] = await Promise.all([
        updateTask(task.id, updates),
        change && (change.add.length > 0 || change.remove.length > 0)
          ? updateTaskTags(task.id, change)
          : undefined,
      ]);
      return row;
    },
    onSuccess: (row, { task, tagIds }) => {
      applySavedRow(task, row, tagIds);
      if (row.is_archived !== task.is_archived) {
        queryClient.invalidateQueries({ queryKey: queryKeys.archivedTasks(projectId) });
      }
    },
    // The two writes are independent, so one may have landed; resync.
    onError: invalidate,
    meta: { errorMessage: "Failed to update task" },
  });

  // Optimistic: the new order is written straight into the cache so the
  // board re-syncs from a single source of truth while the writes are in
  // flight; a failure rolls back and refetches.
  const reorder = useMutation({
    mutationFn: reorderTasks,
    onMutate: (updates) => {
      const byId = new Map(updates.map((u) => [u.id, u]));
      return patchOptimistically<TaskList>(queryClient, tasksKey, (old) =>
        old.map((task) => {
          const u = byId.get(task.id);
          if (!u) return task;
          return { ...task, position: u.position, column_id: u.column_id ?? task.column_id };
        })
      );
    },
    onError: (_error, _vars, context) => {
      rollback(queryClient, tasksKey, context);
      invalidate();
    },
    meta: { errorMessage: "Failed to reorder tasks" },
  });

  // Optimistic: deleting only removes rows (subtasks and tag links cascade),
  // so there is nothing to re-fetch.
  const remove = useMutation({
    mutationFn: deleteTask,
    onMutate: (taskId) =>
      patchOptimistically<TaskList>(queryClient, tasksKey, (old) =>
        old.filter((t) => t.id !== taskId)
      ),
    onSuccess: () => toast.success("Task deleted"),
    onError: (_error, _vars, context) => rollback(queryClient, tasksKey, context),
    meta: { errorMessage: "Failed to delete task" },
  });

  const duplicate = useMutation({
    mutationFn: duplicateTask,
    onSuccess: () => {
      invalidate();
      toast.success("Task duplicated");
    },
    meta: { errorMessage: "Failed to duplicate task" },
  });

  // Optimistic: checkbox toggles reflect instantly; the saved row then
  // brings the server timestamp. Only completing a recurring task re-fetches
  // (to pick up its next occurrence).
  const setCompleted = useMutation({
    mutationFn: ({ task, completed }: { task: TaskWithRelations; completed: boolean }) =>
      updateTask(task.id, { completed_at: completed ? new Date().toISOString() : null }),
    onMutate: ({ task, completed }) => {
      const completedAt = completed ? new Date().toISOString() : null;
      return patchOptimistically<TaskList>(queryClient, tasksKey, (old) =>
        old.map((t) => (t.id === task.id ? { ...t, completed_at: completedAt } : t))
      );
    },
    onSuccess: (row, { task, completed }) => {
      applySavedRow(task, row);
      if (completed) toast.success("Task completed");
    },
    onError: (_error, _vars, context) => rollback(queryClient, tasksKey, context),
    meta: { errorMessage: "Failed to update task" },
  });
  // Quick-add (the inline composer). Optimistic: a placeholder task goes
  // into the cache synchronously, so the next quick-add -- even one queued
  // in the same tick by a multi-line paste -- sees it and takes the
  // following position. Positions computed from server data alone would
  // repeat while earlier saves are still in flight, and the database's
  // make-room trigger would then shuffle the new tasks out of order.
  const quickAddPending = useRef(0);
  const quickCreate = useMutation({
    mutationFn: (vars: {
      tempId: string;
      projectId: string;
      columnId: string;
      title: string;
      position: number;
    }) => createTask(vars),
    onSuccess: (created, { tempId }) => {
      queryClient.setQueryData<TaskWithRelations[]>(tasksKey, (old = []) => {
        if (old.some((t) => t.id === tempId))
          return old.map((t) => (t.id === tempId ? created : t));
        // A refetch replaced the cache mid-flight; it may already hold the row.
        return old.some((t) => t.id === created.id) ? old : [...old, created];
      });
    },
    onError: (error: Error, { tempId, title }) => {
      queryClient.setQueryData<TaskWithRelations[]>(tasksKey, (old = []) =>
        old.filter((t) => t.id !== tempId)
      );
      toast.error(`Couldn't add "${title}": ${error.message || "unknown error"}`);
    },
    onSettled: () => {
      quickAddPending.current -= 1;
      if (quickAddPending.current === 0) invalidate();
    },
  });

  const quickCreateMutate = quickCreate.mutate;
  const quickAdd = useCallback(
    (columnId: string, title: string): TaskWithRelations => {
      // Stop an in-flight refetch from landing on top of the placeholder.
      void queryClient.cancelQueries({ queryKey: tasksKey });
      const current = queryClient.getQueryData<TaskWithRelations[]>(tasksKey) ?? [];
      const now = new Date().toISOString();
      const placeholder: TaskWithRelations = {
        id: `${TEMP_TASK_PREFIX}${crypto.randomUUID()}`,
        project_id: projectId,
        column_id: columnId,
        user_id: "",
        title: title.trim(),
        description: null,
        position: nextPosition(current, columnId),
        priority: "medium",
        start_date: null,
        due_date: null,
        completed_at: null,
        is_archived: false,
        recurrence_type: "none",
        recurrence_cron: null,
        recurrence_parent_id: null,
        created_at: now,
        updated_at: now,
        subtasks: [],
        tags: [],
      };
      queryClient.setQueryData<TaskWithRelations[]>(tasksKey, (old = []) => [...old, placeholder]);
      quickAddPending.current += 1;
      quickCreateMutate({
        tempId: placeholder.id,
        projectId,
        columnId,
        title: placeholder.title,
        position: placeholder.position,
      });
      return placeholder;
    },
    // tasksKey is derived from projectId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, projectId, quickCreateMutate]
  );

  return { create, update, reorder, remove, duplicate, setCompleted, quickAdd };
}
