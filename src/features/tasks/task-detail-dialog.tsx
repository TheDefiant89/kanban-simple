import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Copy, Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubtaskList, type SubtaskItem } from "@/features/tasks/subtask-list";
import { TagSelector } from "@/features/tasks/tag-selector";
import { taskFormSchema, type TaskFormInput } from "@/features/tasks/schemas";
import { useTaskMutations } from "@/features/board/use-board";
import { useTagMutations, useTags } from "@/features/board/use-tags";
import { createSubtask, deleteSubtask, updateSubtask } from "@/services/subtasks";
import { setTaskTags } from "@/services/tasks";
import { queryKeys } from "@/lib/query-client";
import { formatDate } from "@/lib/dates";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  RECURRENCE_TYPES,
  type ColumnWithTasks,
  type TaskWithRelations,
} from "@/types";

interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskWithRelations | null;
  projectId: string;
  columns: ColumnWithTasks[];
  defaultColumnId?: string;
}

const RECURRENCE_LABELS: Record<string, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  custom: "Custom (cron)",
};

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function TaskDetailDialog({
  open,
  onOpenChange,
  task,
  projectId,
  columns,
  defaultColumnId,
}: TaskDetailDialogProps) {
  const isEdit = !!task;
  const queryClient = useQueryClient();
  const taskMutations = useTaskMutations(projectId);
  const { data: allTags = [] } = useTags();
  const tagMutations = useTagMutations();

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TaskFormInput>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      columnId: defaultColumnId ?? columns[0]?.id ?? "",
      priority: "medium",
      startDate: "",
      dueDate: "",
      completedDate: "",
      recurrenceType: "none",
      recurrenceCron: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (task) {
      reset({
        title: task.title,
        description: task.description ?? "",
        columnId: task.column_id,
        priority: task.priority,
        startDate: toDateInputValue(task.start_date),
        dueDate: toDateInputValue(task.due_date),
        completedDate: toDateInputValue(task.completed_at),
        recurrenceType: task.recurrence_type,
        recurrenceCron: task.recurrence_cron ?? "",
      });
      setSelectedTagIds(task.tags.map((t) => t.id));
      setSubtasks(task.subtasks);
    } else {
      reset({
        title: "",
        description: "",
        columnId: defaultColumnId ?? columns[0]?.id ?? "",
        priority: "medium",
        startDate: "",
        dueDate: "",
        completedDate: "",
        recurrenceType: "none",
        recurrenceCron: "",
      });
      setSelectedTagIds([]);
      setSubtasks([]);
    }
    setConfirmDelete(false);
  }, [open, task, defaultColumnId, columns, reset]);

  const recurrenceType = watch("recurrenceType");
  const completedDate = watch("completedDate");

  const invalidateTasks = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });

  const handleAddSubtask = async (title: string) => {
    if (isEdit && task) {
      try {
        const created = await createSubtask({ taskId: task.id, title, position: subtasks.length });
        setSubtasks((prev) => [
          ...prev,
          { id: created.id, title: created.title, is_completed: created.is_completed },
        ]);
        invalidateTasks();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add subtask");
      }
    } else {
      setSubtasks((prev) => [...prev, { id: crypto.randomUUID(), title, is_completed: false }]);
    }
  };

  const handleToggleSubtask = async (id: string, completed: boolean) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, is_completed: completed } : s)));
    if (isEdit) {
      try {
        await updateSubtask(id, { is_completed: completed });
        invalidateTasks();
      } catch (error) {
        setSubtasks((prev) =>
          prev.map((s) => (s.id === id ? { ...s, is_completed: !completed } : s))
        );
        toast.error(error instanceof Error ? error.message : "Failed to update subtask");
      }
    }
  };

  const handleDeleteSubtask = async (id: string) => {
    const previous = subtasks;
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    if (isEdit) {
      try {
        await deleteSubtask(id);
        invalidateTasks();
      } catch (error) {
        setSubtasks(previous);
        toast.error(error instanceof Error ? error.message : "Failed to delete subtask");
      }
    }
  };

  const handleCreateTag = async (input: { name: string; color: string }) => {
    return tagMutations.create.mutateAsync(input);
  };

  const onSubmit = async (values: TaskFormInput) => {
    setSubmitting(true);
    try {
      const completedAt = values.completedDate
        ? new Date(`${values.completedDate}T00:00:00`).toISOString()
        : null;

      if (isEdit && task) {
        await taskMutations.update.mutateAsync({
          taskId: task.id,
          updates: {
            title: values.title,
            description: values.description || null,
            column_id: values.columnId,
            priority: values.priority,
            start_date: values.startDate || null,
            due_date: values.dueDate || null,
            completed_at: completedAt,
            recurrence_type: values.recurrenceType,
            recurrence_cron:
              values.recurrenceType === "custom" ? values.recurrenceCron || null : null,
          },
        });
        await setTaskTags(task.id, selectedTagIds);
      } else {
        const targetColumn = columns.find((c) => c.id === values.columnId);
        const created = await taskMutations.create.mutateAsync({
          projectId,
          columnId: values.columnId,
          title: values.title,
          description: values.description,
          position: targetColumn?.tasks.length ?? 0,
          priority: values.priority,
          startDate: values.startDate || null,
          dueDate: values.dueDate || null,
          recurrenceType: values.recurrenceType,
          recurrenceCron: values.recurrenceType === "custom" ? values.recurrenceCron || null : null,
          tagIds: selectedTagIds,
        });
        for (const [index, subtask] of subtasks.entries()) {
          await createSubtask({ taskId: created.id, title: subtask.title, position: index });
        }
        invalidateTasks();
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save task");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit task" : "New task"}</DialogTitle>
          </DialogHeader>

          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-title">Title</Label>
              <Input id="task-title" autoFocus placeholder="Task title" {...register("title")} />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                rows={3}
                placeholder="Add more details…"
                {...register("description")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Column</Label>
                <Select value={watch("columnId")} onValueChange={(v) => setValue("columnId", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Priority</Label>
                <Select
                  value={watch("priority")}
                  onValueChange={(v) => setValue("priority", v as TaskFormInput["priority"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Recurrence</Label>
                <Select
                  value={watch("recurrenceType")}
                  onValueChange={(v) =>
                    setValue("recurrenceType", v as TaskFormInput["recurrenceType"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_TYPES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {RECURRENCE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {recurrenceType === "custom" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recurrence-cron">Cron expression</Label>
                <Input
                  id="recurrence-cron"
                  placeholder="0 9 * * 1"
                  {...register("recurrenceCron")}
                />
                {errors.recurrenceCron && (
                  <p className="text-xs text-destructive">{errors.recurrenceCron.message}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="start-date">Start date</Label>
                <Input id="start-date" type="date" {...register("startDate")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="due-date">Due date</Label>
                <Input id="due-date" type="date" {...register("dueDate")} />
                {errors.dueDate && (
                  <p className="text-xs text-destructive">{errors.dueDate.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="completed-date">Completed</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={!!completedDate}
                    onCheckedChange={(checked) =>
                      setValue(
                        "completedDate",
                        checked ? formatDate(new Date().toISOString(), "yyyy-MM-dd") : ""
                      )
                    }
                  />
                  <Input
                    id="completed-date"
                    type="date"
                    className="flex-1"
                    {...register("completedDate")}
                  />
                </div>
              </div>
            </div>

            <TagSelector
              tags={allTags}
              selectedIds={selectedTagIds}
              onToggle={(id) =>
                setSelectedTagIds((prev) =>
                  prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
                )
              }
              onCreate={handleCreateTag}
            />

            <SubtaskList
              subtasks={subtasks}
              onAdd={handleAddSubtask}
              onToggle={handleToggleSubtask}
              onDelete={handleDeleteSubtask}
            />

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {isEdit && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await taskMutations.duplicate.mutateAsync(task!.id);
                        onOpenChange(false);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await taskMutations.update.mutateAsync({
                          taskId: task!.id,
                          updates: { is_archived: !task!.is_archived },
                        });
                        onOpenChange(false);
                      }}
                    >
                      {task!.is_archived ? (
                        <>
                          <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                        </>
                      ) : (
                        <>
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </Button>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? "Save changes" : "Create task"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the task and its subtasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (task) await taskMutations.remove.mutateAsync(task.id);
                setConfirmDelete(false);
                onOpenChange(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
