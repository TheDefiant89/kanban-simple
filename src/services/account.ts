import { supabase } from "@/supabase/client";

/**
 * Deletes all of the current user's app data and, where permitted, their
 * auth account. The current password is verified server-side by the
 * delete_own_account RPC, so a hijacked/stolen session alone isn't enough
 * to destroy the account, even via a direct API call. Repeated incorrect
 * attempts are rate-limited server-side (see migration 20260711000000);
 * the RPC reports that via its return value rather than a thrown error,
 * since a raised exception would roll back its own attempt tracking write.
 */
export async function deleteOwnAccount(password: string): Promise<void> {
  const { data, error } = await supabase.rpc("delete_own_account", { current_password: password });
  if (error) throw new Error(/incorrect password/i.test(error.message) ? "Incorrect password" : error.message);
  if (data === "incorrect_password") throw new Error("Incorrect password");
  if (data === "locked_out") {
    throw new Error("Too many incorrect password attempts. Try again in a few minutes.");
  }
  await supabase.auth.signOut();
}
