import { supabase } from "@/supabase/client";
import type { Tag } from "@/types";

export async function listTags(): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createTag(input: { name: string; color: string }): Promise<Tag> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("tags")
    .insert({ user_id: userId, name: input.name.trim(), color: input.color })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTag(
  tagId: string,
  updates: Partial<Pick<Tag, "name" | "color">>
): Promise<Tag> {
  const { data, error } = await supabase
    .from("tags")
    .update(updates)
    .eq("id", tagId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTag(tagId: string): Promise<void> {
  const { error } = await supabase.from("tags").delete().eq("id", tagId);
  if (error) throw error;
}
