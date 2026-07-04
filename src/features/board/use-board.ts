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
import { getProject } from "@/services/projects";

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

  const columns: ColumnWithTasks[] = (columnsQuery.data ?? []).map((column) => ({
    ...column,
    tasks: (tasksQuery.data ?? [])
      .filter((t) => t.column_id === column.id)
      .sort((a, b) => a.position - b.position),
  }));

  return {
    project: projectQuery.data,
    columns,
    isLoading: projectQuery.isLoading || columnsQuery.isLoading || tasksQuery.isLoading,
    error: projectQuery.error || columnsQuery.error || tasksQuery.error,
  };
}

export function useColumnMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.columns(projectId) });

  const create = useMutation({
    mutationFn: createColumn,
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to create column"),
  });

  const update = useMutation({
    mutationFn: ({ columnId, updates }: { columnId: string; updates: Partial<Column> }) =>
      updateColumn(columnId, updates),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to update column"),
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
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to reorder columns"),
  });

  return { create, update, remove, reorder };
}

export function useTaskMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });

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

  const reorder = useMutation({
    mutationFn: reorderTasks,
    onError: (error: Error) => {
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

  const setCompleted = useMutation({
    mutationFn: ({ task, completed }: { task: TaskWithRelations; completed: boolean }) =>
      updateTask(task.id, { completed_at: completed ? new Date().toISOString() : null }),
    onSuccess: (_, { completed }) => {
      invalidate();
      if (completed) toast.success("Task completed");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update task"),
  });

  return { create, update, move, reorder, remove, duplicate, setCompleted };
}
