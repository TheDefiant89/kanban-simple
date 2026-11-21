import { supabase } from "@/supabase/client";

/**
 * The signed-in user's id, read from the locally stored session.
 *
 * Unlike supabase.auth.getUser(), this makes no request to the auth server,
 * so it's cheap enough to call before any query. It's only used to narrow
 * queries to the user's own rows (e.g. profile lookups, slug collision
 * checks); row-level security remains the actual access control, and
 * inserts get user_id from the database's auth.uid() default.
 */
export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Not authenticated");
  return userId;
}
