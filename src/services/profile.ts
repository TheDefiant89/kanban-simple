import { supabase } from "@/supabase/client";
import { currentUserId } from "@/services/session";

/** Days after completion before a task is auto-archived; null = never. */
export type AutoArchiveDays = 7 | 14 | 30 | 90 | null;
export const AUTO_ARCHIVE_OPTIONS: AutoArchiveDays[] = [null, 7, 14, 30, 90];

export async function getAutoArchiveDays(): Promise<AutoArchiveDays> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("auto_archive_days")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data.auto_archive_days as AutoArchiveDays;
}

export async function setAutoArchiveDays(days: AutoArchiveDays): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from("profiles")
    .update({ auto_archive_days: days })
    .eq("id", userId);
  if (error) throw error;
}
