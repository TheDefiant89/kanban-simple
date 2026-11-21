import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-context";
import { listEnabledFeatureFlags } from "@/services/feature-flags";
import { queryKeys } from "@/lib/query-client";
import { parseFlagList, resolveEnabledFlags, type FeatureFlag } from "@/lib/feature-flags";

// Local-only override: VITE_FEATURE_FLAGS=bulk-edit,other in .env.local turns
// flags on during `npm run dev` without touching the database. Ignored in
// production builds.
const DEV_OVERRIDES = import.meta.env.DEV ? parseFlagList(import.meta.env.VITE_FEATURE_FLAGS) : [];

/**
 * Set of flag keys that are on for the signed-in user.
 *
 * Fails closed: while loading, signed out, or if the request errors (e.g.
 * the feature_flags migration hasn't been applied yet), every flag reads as
 * off, so other users never see an unreleased feature by accident.
 */
export function useFeatureFlags(): ReadonlySet<string> {
  const { user } = useAuth();
  const { data } = useQuery({
    // Keyed by user so switching accounts on one device never reuses the
    // previous account's flags.
    queryKey: queryKeys.featureFlags(user?.id ?? ""),
    queryFn: listEnabledFeatureFlags,
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return resolveEnabledFlags(user ? data : undefined, DEV_OVERRIDES);
}

/** Whether one flag is on for the signed-in user. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  return useFeatureFlags().has(flag);
}
