import { supabase } from "@/supabase/client";
import type { Priority, RecurrenceType, Tag, Task, TaskWithRelations } from "@/types";

type RawTask = Task & {
  subtasks: TaskWithRelations["subtasks"];
  task_tags: { tag_id: string; tags: Tag | null }[];
};

function hydrate(raw: RawTask): TaskWithRelations {
  const { task_tags, subtasks, ...task } = raw;
  return {
    ...task,
    subtasks: [...subtasks].sort((a, b) => a.position - b.position),
    tags: task_tags.map((tt) => tt.tags).filter((t): t is Tag => t !== null),
  };
}

const TASK_SELECT = "*, subtasks(*), task_tags(tag_id, tags(*))";

export async function listTasks(
  projectId: string,
  includeArchived = false
): Promise<TaskWithRelations[]> {
  let query = supabase.from("tasks").select(TASK_SELECT).eq("project_id", projectId);
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query.order("position", { ascending: true });
  if (error) throw error;
  return (data as unknown as RawTask[]).map(hydrate);
}

export async function createTask(input: {
  projectId: string;
  columnId: string;
  title: string;
  description?: string;
  position: number;
  priority?: Priority;
  startDate?: string | null;
  dueDate?: string | null;
  recurrenceType?: RecurrenceType;
  recurrenceCron?: string | null;
  tagIds?: string[];
}): Promise<TaskWithRelations> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      column_id: input.columnId,
      user_id: userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      position: input.position,
      priority: input.priority ?? "medium",
      start_date: input.startDate ?? null,
      due_date: input.dueDate ?? null,
      recurrence_type: input.recurrenceType ?? "none",
      recurrence_cron: input.recurrenceCron ?? null,
    })
    .select(TASK_SELECT)
    .single();
  if (error) throw error;

  if (input.tagIds && input.tagIds.length > 0) {
    await setTaskTags(task.id, input.tagIds);
    return getTask(task.id);
  }

  return hydrate(task as unknown as RawTask);
}

export async function getTask(taskId: string): Promise<TaskWithRelations> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .single();
  if (error) throw error;
  return hydrate(data as unknown as RawTask);
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: Priority;
  start_date?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  column_id?: string;
  position?: number;
  is_archived?: boolean;
  recurrence_type?: RecurrenceType;
  recurrence_cron?: string | null;
}

export async function updateTask(taskId: string, updates: UpdateTaskInput): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function moveTask(taskId: string, columnId: string, position: number): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ column_id: columnId, position })
    .eq("id", taskId);
  if (error) throw error;
}

export async function reorderTasks(
  updates: { id: string; position: number; column_id?: string }[]
): Promise<void> {
  if (updates.length === 0) return;
  // Single round trip via RPC instead of one UPDATE request per row.
  const { error } = await supabase.rpc("reorder_tasks", { updates });
  if (error) throw error;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function duplicateTask(taskId: string): Promise<TaskWithRelations> {
  const original = await getTask(taskId);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data: created, error } = await supabase
    .from("tasks")
    .insert({
      project_id: original.project_id,
      column_id: original.column_id,
      user_id: userId,
      title: `${original.title} (copy)`,
      description: original.description,
      position: original.position + 1,
      priority: original.priority,
      start_date: original.start_date,
      due_date: original.due_date,
      recurrence_type: original.recurrence_type,
      recurrence_cron: original.recurrence_cron,
    })
    .select()
    .single();
  if (error) throw error;

  if (original.subtasks.length > 0) {
    await supabase.from("subtasks").insert(
      original.subtasks.map((s) => ({
        task_id: created.id,
        user_id: userId,
        title: s.title,
        is_completed: s.is_completed,
        position: s.position,
      }))
    );
  }

  if (original.tags.length > 0) {
    await setTaskTags(
      created.id,
      original.tags.map((t) => t.id)
    );
  }

  return getTask(created.id);
}

export interface TaskStat {
  project_id: string;
  due_date: string | null;
  completed_at: string | null;
}

/** Lightweight rows used to compute dashboard tile stats across all of a user's projects. */
export async function listTaskStatsForUser(): Promise<TaskStat[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("project_id, due_date, completed_at")
    .eq("is_archived", false);
  if (error) throw error;
  return data ?? [];
}

export async function setTaskTags(taskId: string, tagIds: string[]): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { error: deleteError } = await supabase.from("task_tags").delete().eq("task_id", taskId);
  if (deleteError) throw deleteError;

  if (tagIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("task_tags")
    .insert(tagIds.map((tagId) => ({ task_id: taskId, tag_id: tagId, user_id: userId })));
  if (insertError) throw insertError;
}
