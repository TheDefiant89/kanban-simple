import type { ReactNode } from "react";
import { useFeatureFlag } from "@/features/flags/use-feature-flags";
import type { FeatureFlag } from "@/lib/feature-flags";

interface FeatureGateProps {
  flag: FeatureFlag;
  children: ReactNode;
  /** Rendered instead when the flag is off (e.g. the current version). */
  fallback?: ReactNode;
}

/**
 * Renders `children` only for users the flag is on for.
 *
 *   <FeatureGate flag="bulk-edit">
 *     <BulkEditButton />
 *   </FeatureGate>
 */
export function FeatureGate({ flag, children, fallback = null }: FeatureGateProps) {
  return useFeatureFlag(flag) ? children : fallback;
}
