import { PRIORITY_COLORS, PRIORITY_LABELS, type Priority } from "@/types";
import { cn } from "@/lib/utils";

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
        className
      )}
      style={{
        color: PRIORITY_COLORS[priority],
        borderColor: `${PRIORITY_COLORS[priority]}40`,
        backgroundColor: `${PRIORITY_COLORS[priority]}14`,
      }}
    >
      <span
        className="neon-sm h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: PRIORITY_COLORS[priority],
          ["--glow-c" as string]: PRIORITY_COLORS[priority],
        }}
      />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
