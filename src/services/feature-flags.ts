import { supabase } from "@/supabase/client";

/**
 * Keys of the feature flags that are on for the signed-in user: released
 * flags plus any they're individually opted into. Row-level security does
 * the filtering (supabase/migrations/20261121000000_feature_flags.sql), so
 * this never sees flags that are off for this user.
 */
export async function listEnabledFeatureFlags(): Promise<string[]> {
  const { data, error } = await supabase.from("feature_flags").select("key");
  if (error) throw error;
  return data.map((row) => row.key);
}
