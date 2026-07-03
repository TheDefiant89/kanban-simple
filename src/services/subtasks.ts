import { supabase } from "@/supabase/client";
import type { Subtask } from "@/types";

export async function createSubtask(input: {
  taskId: string;
  title: string;
  position: number;
}): Promise<Subtask> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("subtasks")
    .insert({
      task_id: input.taskId,
      user_id: userId,
      title: input.title.trim(),
      position: input.position,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSubtask(
  subtaskId: string,
  updates: Partial<Pick<Subtask, "title" | "is_completed" | "position">>
): Promise<Subtask> {
  const { data, error } = await supabase
    .from("subtasks")
    .update(updates)
    .eq("id", subtaskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSubtask(subtaskId: string): Promise<void> {
  const { error } = await supabase.from("subtasks").delete().eq("id", subtaskId);
  if (error) throw error;
}
