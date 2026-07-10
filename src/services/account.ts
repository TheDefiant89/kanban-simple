import { supabase } from "@/supabase/client";

/**
 * Deletes all of the current user's app data and, where permitted, their
 * auth account. The current password is verified server-side by the
 * delete_own_account RPC, so a hijacked/stolen session alone isn't enough
 * to destroy the account, even via a direct API call.
 */
export async function deleteOwnAccount(password: string): Promise<void> {
  const { error } = await supabase.rpc("delete_own_account", { current_password: password });
  if (error) throw new Error(/incorrect password/i.test(error.message) ? "Incorrect password" : error.message);
  await supabase.auth.signOut();
}
