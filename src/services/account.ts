import { supabase } from "@/supabase/client";
import { reauthenticateWithPassword } from "./auth";

/**
 * Deletes all of the current user's app data and, where permitted, their
 * auth account. Requires the current password to be re-verified first, so a
 * hijacked/stolen session alone isn't enough to destroy the account.
 */
export async function deleteOwnAccount(password: string): Promise<void> {
  await reauthenticateWithPassword(password);
  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw error;
  await supabase.auth.signOut();
}
