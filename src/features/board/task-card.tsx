import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CheckSquare, Repeat } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { formatDate, isOverdue } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PRIORITY_COLORS, type TaskWithRelations } from "@/types";

interface TaskCardProps {
  task: TaskWithRelations;
  onOpen: (task: TaskWithRelations) => void;
  onToggleComplete: (task: TaskWithRelations, completed: boolean) => void;
  dragging?: boolean;
}

// Memoised: the board re-renders on every filter keystroke and drag-over
// event, but with stable callbacks and task identities only cards whose
// task actually changed re-render.
export const TaskCard = memo(function TaskCard({
  task,
  onOpen,
  onToggleComplete,
  dragging,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftColor: PRIORITY_COLORS[task.priority],
  };

  const overdue = isOverdue(task.due_date, task.completed_at);
  const completedSubtasks = task.subtasks.filter((s) => s.is_completed).length;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      className={cn(
        "cursor-pointer touch-none select-none gap-0 rounded-lg border-l-4 p-3 shadow-sm transition-shadow hover:shadow-md",
        (isDragging || dragging) && "opacity-50",
        task.completed_at && "opacity-70"
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={!!task.completed_at}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(checked) => onToggleComplete(task, checked === true)}
          className="mt-0.5"
        />
        {/* Real button so keyboard users can open the task: Enter/Space on
            the card itself are claimed by dnd-kit's KeyboardSensor for
            dragging, which made the details dialog mouse-only. Keydown is
            stopped from bubbling so activating it doesn't start a drag. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(task);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(
            "min-w-0 flex-1 cursor-pointer text-left text-sm font-medium leading-snug",
            task.completed_at && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </button>
        {task.recurrence_type !== "none" && (
          <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>

      {task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PriorityBadge priority={task.priority} />
        {task.due_date && (
          <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive")}>
            <CalendarClock className="h-3 w-3" /> {formatDate(task.due_date, "MMM d")}
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <CheckSquare className="h-3 w-3" />
            {completedSubtasks}/{task.subtasks.length}
          </span>
        )}
      </div>
    </Card>
  );
});
