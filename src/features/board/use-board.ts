import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-client";
import type { Column, ColumnWithTasks, TaskWithRelations } from "@/types";
import { createColumn, deleteColumn, reorderColumns, updateColumn } from "@/services/columns";
import {
  createTask,
  deleteTask,
  duplicateTask,
  listTasks,
  moveTask,
  reorderTasks,
  updateTask,
  type UpdateTaskInput,
} from "@/services/tasks";
import { listColumns } from "@/services/columns";
import { getProject, getProjectBySlug } from "@/services/projects";

export function useProjectBySlug(slug: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["project-by-slug", slug],
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

export function useColumnMutations(projectId: string) {
  const queryClient = useQueryClient();
  const columnsKey = queryKeys.columns(projectId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: columnsKey });

  const create = useMutation({
    mutationFn: createColumn,
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to create column"),
  });

  // Optimistic: collapse toggles and renames apply instantly instead of
  // waiting a full round trip + refetch.
  const update = useMutation({
    mutationFn: ({ columnId, updates }: { columnId: string; updates: Partial<Column> }) =>
      updateColumn(columnId, updates),
    onMutate: async ({ columnId, updates }) => {
      await queryClient.cancelQueries({ queryKey: columnsKey });
      const previous = queryClient.getQueryData<Column[]>(columnsKey);
      queryClient.setQueryData<Column[]>(columnsKey, (old = []) =>
        old.map((c) => (c.id === columnId ? { ...c, ...updates } : c))
      );
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(columnsKey, context.previous);
      toast.error(error.message || "Failed to update column");
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: deleteColumn,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      toast.success("Column deleted");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete column"),
  });

  const reorder = useMutation({
    mutationFn: reorderColumns,
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: columnsKey });
      const previous = queryClient.getQueryData<Column[]>(columnsKey);
      const positions = new Map(updates.map((u) => [u.id, u.position]));
      queryClient.setQueryData<Column[]>(columnsKey, (old = []) =>
        old.map((c) => {
          const position = positions.get(c.id);
          return position === undefined ? c : { ...c, position };
        })
      );
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(columnsKey, context.previous);
      toast.error(error.message || "Failed to reorder columns");
      invalidate();
    },
  });

  return { create, update, remove, reorder };
}

export function useTaskMutations(projectId: string) {
  const queryClient = useQueryClient();
  const tasksKey = queryKeys.tasks(projectId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: tasksKey });

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to create task"),
  });

  const update = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: UpdateTaskInput }) =>
      updateTask(taskId, updates),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to update task"),
  });

  const move = useMutation({
    mutationFn: ({
      taskId,
      columnId,
      position,
    }: {
      taskId: string;
      columnId: string;
      position: number;
    }) => moveTask(taskId, columnId, position),
    onError: (error: Error) => {
      toast.error(error.message || "Failed to move task");
      invalidate();
    },
  });

  // Optimistic: the new order is written straight into the cache so the
  // board re-syncs from a single source of truth while the writes are in
  // flight; a failure rolls back and refetches.
  const reorder = useMutation({
    mutationFn: reorderTasks,
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const previous = queryClient.getQueryData<TaskWithRelations[]>(tasksKey);
      const byId = new Map(updates.map((u) => [u.id, u]));
      queryClient.setQueryData<TaskWithRelations[]>(tasksKey, (old = []) =>
        old.map((task) => {
          const u = byId.get(task.id);
          if (!u) return task;
          return { ...task, position: u.position, column_id: u.column_id ?? task.column_id };
        })
      );
      return { previous };
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(tasksKey, context.previous);
      toast.error(error.message || "Failed to reorder tasks");
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      invalidate();
      toast.success("Task deleted");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to delete task"),
  });

  const duplicate = useMutation({
    mutationFn: duplicateTask,
    onSuccess: () => {
      invalidate();
      toast.success("Task duplicated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to duplicate task"),
  });

  // Optimistic: checkbox toggles reflect instantly; the settled refetch
  // reconciles the server-assigned timestamp.
  const setCompleted = useMutation({
    mutationFn: ({ task, completed }: { task: TaskWithRelations; completed: boolean }) =>
      updateTask(task.id, { completed_at: completed ? new Date().toISOString() : null }),
    onMutate: async ({ task, completed }) => {
      await queryClient.cancelQueries({ queryKey: tasksKey });
      const previous = queryClient.getQueryData<TaskWithRelations[]>(tasksKey);
      const completedAt = completed ? new Date().toISOString() : null;
      queryClient.setQueryData<TaskWithRelations[]>(tasksKey, (old = []) =>
        old.map((t) => (t.id === task.id ? { ...t, completed_at: completedAt } : t))
      );
      return { previous };
    },
    onSuccess: (_, { completed }) => {
      if (completed) toast.success("Task completed");
    },
    onError: (error: Error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(tasksKey, context.previous);
      toast.error(error.message || "Failed to update task");
    },
    onSettled: invalidate,
  });

  return { create, update, move, reorder, remove, duplicate, setCompleted };
}
