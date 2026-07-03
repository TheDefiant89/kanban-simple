import { supabase } from "@/supabase/client";

/** Deletes all of the current user's app data and, where permitted, their auth account. */
export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw error;
  await supabase.auth.signOut();
}
