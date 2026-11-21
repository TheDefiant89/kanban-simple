/**
 * Every feature flag the app knows about, with a one-line description.
 *
 * To hide a new feature: add its key here (lowercase, digits, hyphens),
 * wrap the UI in <FeatureGate flag="..."> or check useFeatureFlag("..."),
 * and create the matching row in the `feature_flags` table. Full steps,
 * including turning it on for just your account and releasing it, are in
 * README.md under "Feature flags".
 *
 * Remove the key (and the gate) once a feature is released to everyone.
 */
export const FEATURE_FLAGS = {
  // "bulk-edit": "Select several tasks and edit them together",
} as const satisfies Record<string, string>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Parses a comma/space separated list of flag keys, e.g. the
 * VITE_FEATURE_FLAGS dev override. Blank entries are dropped.
 */
export function parseFlagList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((key) => key.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The flags on for the current user: whatever the database says, plus any
 * local overrides. Overrides are only passed in during `npm run dev` (see
 * use-feature-flags.ts), so a production build can't be forced on.
 */
export function resolveEnabledFlags(
  fromDatabase: readonly string[] | undefined,
  devOverrides: readonly string[] = []
): ReadonlySet<string> {
  return new Set([...(fromDatabase ?? []), ...devOverrides]);
}
