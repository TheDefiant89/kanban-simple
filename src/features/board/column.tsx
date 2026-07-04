import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskCard } from "@/features/board/task-card";
import { cn } from "@/lib/utils";
import type { ColumnWithTasks, TaskWithRelations } from "@/types";

export const dropzoneId = (columnId: string) => `dropzone::${columnId}`;

interface ColumnComponentProps {
  column: ColumnWithTasks;
  onAddTask: () => void;
  onOpenTask: (task: TaskWithRelations) => void;
  onToggleComplete: (task: TaskWithRelations, completed: boolean) => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
}

export function ColumnComponent({
  column,
  onAddTask,
  onOpenTask,
  onToggleComplete,
  onRename,
  onDelete,
  onToggleCollapse,
}: ColumnComponentProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: "column", column },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropzoneId(column.id),
    data: { type: "column-dropzone", columnId: column.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (column.is_collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex h-full w-11 shrink-0 flex-col items-center gap-2 rounded-xl border bg-muted/40 py-3"
      >
        <button
          {...attributes}
          {...listeners}
          onClick={onToggleCollapse}
          className="flex flex-col items-center gap-2"
          aria-label="Expand column"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: column.color }}
          >
            {column.tasks.length}
          </span>
          <span className="mt-1 rotate-180 whitespace-nowrap text-xs font-medium [writing-mode:vertical-rl]">
            {column.name}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col rounded-xl border bg-muted/40",
        isDragging && "opacity-50"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab items-center gap-2 rounded-t-xl border-b px-3 py-2.5 active:cursor-grabbing"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: column.color }}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{column.name}</span>
        <span className="rounded-full bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
          {column.tasks.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          aria-label="Collapse column"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => e.stopPropagation()}
              aria-label="Column actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>Edit column</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={setDropRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden scrollbar-thin p-2 transition-colors",
          isOver && "bg-primary/5"
        )}
      >
        <SortableContext
          items={column.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={() => onOpenTask(task)}
              onToggleComplete={(completed) => onToggleComplete(task, completed)}
            />
          ))}
        </SortableContext>
      </div>

      <div className="shrink-0 p-2 pt-0">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={onAddTask}
        >
          <Plus className="h-4 w-4" /> Add task
        </Button>
      </div>
    </div>
  );
}
