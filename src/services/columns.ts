import { supabase } from "@/supabase/client";
import type { Column } from "@/types";

export async function listColumns(projectId: string): Promise<Column[]> {
  const { data, error } = await supabase
    .from("columns")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createColumn(input: {
  projectId: string;
  name: string;
  color: string;
  position: number;
}): Promise<Column> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("columns")
    .insert({
      project_id: input.projectId,
      user_id: userId,
      name: input.name.trim(),
      color: input.color,
      position: input.position,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateColumn(
  columnId: string,
  updates: Partial<Pick<Column, "name" | "color" | "position" | "is_collapsed">>
): Promise<Column> {
  const { data, error } = await supabase
    .from("columns")
    .update(updates)
    .eq("id", columnId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteColumn(columnId: string): Promise<void> {
  const { error } = await supabase.from("columns").delete().eq("id", columnId);
  if (error) throw error;
}

export async function reorderColumns(updates: { id: string; position: number }[]): Promise<void> {
  if (updates.length === 0) return;
  // Single round trip via RPC instead of one UPDATE request per row.
  const { error } = await supabase.rpc("reorder_columns", { updates });
  if (error) throw error;
}
