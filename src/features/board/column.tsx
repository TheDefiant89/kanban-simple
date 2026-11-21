import { memo, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowUpDown, ChevronDown, ChevronRight, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLUMN_SORTS, COLUMN_SORT_LABELS } from "@/lib/sort-tasks";
import { TaskCard } from "@/features/board/task-card";
import { QuickAddComposer } from "@/features/board/quick-add-composer";
import { dropzoneId } from "@/features/board/dnd-ids";
import { cn } from "@/lib/utils";
import type { Column, ColumnSort, ColumnWithTasks, TaskWithRelations } from "@/types";

interface ColumnComponentProps {
  column: ColumnWithTasks;
  /** Whether this column's inline quick-add composer is open. */
  composerOpen: boolean;
  /** Open (columnId) or close (null) the quick-add composer. */
  onSetComposer: (columnId: string | null) => void;
  onQuickAdd: (column: Column, titles: string[]) => void;
  /** Open the full task dialog for this column, optionally pre-filling the title. */
  onAddTask: (columnId: string, title?: string) => void;
  onOpenTask: (task: TaskWithRelations) => void;
  onToggleComplete: (task: TaskWithRelations, completed: boolean) => void;
  onRename: (column: Column) => void;
  onDelete: (column: Column) => void;
  onToggleCollapse: (column: Column) => void;
  onChangeSort: (column: Column, sortBy: ColumnSort) => void;
}

// Memoised: with stable callbacks from Board and identity-preserving
// displayColumns, only columns whose contents changed re-render.
export const ColumnComponent = memo(function ColumnComponent({
  column,
  composerOpen,
  onSetComposer,
  onQuickAdd,
  onAddTask,
  onOpenTask,
  onToggleComplete,
  onRename,
  onDelete,
  onToggleCollapse,
  onChangeSort,
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

  // When the composer closes, hand focus back to "Add task" if focus would
  // otherwise be lost (it was inside the composer, which just unmounted).
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Quick-added tasks go to the end of a custom-ordered column; scroll them
  // into view once they've rendered (the cache update lands a tick later).
  const scrollToEnd = useRef(false);
  const taskCount = column.tasks.length;
  useEffect(() => {
    if (!scrollToEnd.current) return;
    scrollToEnd.current = false;
    const list = listRef.current;
    list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [taskCount]);
  const wasComposerOpen = useRef(composerOpen);
  useEffect(() => {
    if (wasComposerOpen.current && !composerOpen) {
      const active = document.activeElement;
      if (!active || active === document.body) addButtonRef.current?.focus();
    }
    wasComposerOpen.current = composerOpen;
  }, [composerOpen]);

  if (column.is_collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="relative flex h-full w-11 shrink-0 snap-start flex-col items-center gap-2 overflow-hidden rounded-xl border bg-panel py-3 [-webkit-touch-callout:none]"
      >
        <span
          className="neon absolute inset-x-0 top-0 h-[3px]"
          style={{
            background: `linear-gradient(90deg, ${column.color}, ${column.color}40)`,
            ["--glow-c" as string]: column.color,
          }}
        />
        <button
          {...attributes}
          {...listeners}
          onClick={() => onToggleCollapse(column)}
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
          <span className="font-display mt-1 rotate-180 whitespace-nowrap text-xs font-semibold [writing-mode:vertical-rl]">
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
        // Near full-width on phones so one column fills the screen with a
        // sliver of the next showing; fixed width from sm up.
        "relative flex h-full w-[calc(100vw-2.5rem)] shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-panel sm:w-72 short:w-72",
        isDragging && "opacity-50"
      )}
    >
      <span
        className="neon absolute inset-x-0 top-0 z-10 h-[3px]"
        style={{
          background: `linear-gradient(90deg, ${column.color}, ${column.color}40)`,
          ["--glow-c" as string]: column.color,
        }}
      />
      <div
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab select-none items-center gap-2 border-b px-3 pb-2.5 pt-3 active:cursor-grabbing short:pb-1.5 short:pt-2 [-webkit-touch-callout:none]"
      >
        <span
          className="neon-sm h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: column.color, ["--glow-c" as string]: column.color }}
        />
        <span className="font-display min-w-0 flex-1 truncate text-sm font-semibold">
          {column.name}
        </span>
        <span className="rounded-full border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {column.tasks.length}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 sm:h-6 sm:w-6", column.sort_by !== "custom" && "text-primary")}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Sort tasks (${COLUMN_SORT_LABELS[column.sort_by]})`}
              title={`Sorted by: ${COLUMN_SORT_LABELS[column.sort_by]}`}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort tasks by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={column.sort_by}
              onValueChange={(value) => onChangeSort(column, value as ColumnSort)}
            >
              {COLUMN_SORTS.map((sort) => (
                <DropdownMenuRadioItem key={sort} value={sort}>
                  {COLUMN_SORT_LABELS[sort]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 sm:h-6 sm:w-6"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(column);
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
              className="h-8 w-8 sm:h-6 sm:w-6"
              onClick={(e) => e.stopPropagation()}
              aria-label="Column actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onRename(column)}>Edit column</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(column)}>
              <Trash2 className="h-4 w-4" /> Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        ref={(node) => {
          setDropRef(node);
          listRef.current = node;
        }}
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
              onOpen={onOpenTask}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </SortableContext>
      </div>

      <div className="shrink-0 p-2 pt-0">
        {composerOpen ? (
          <QuickAddComposer
            columnId={column.id}
            columnName={column.name}
            onAdd={(titles) => {
              scrollToEnd.current = column.sort_by === "custom";
              onQuickAdd(column, titles);
            }}
            onClose={() => onSetComposer(null)}
            onAddWithDetails={(title) => {
              onSetComposer(null);
              onAddTask(column.id, title);
            }}
          />
        ) : (
          <Button
            ref={addButtonRef}
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => onSetComposer(column.id)}
          >
            <Plus className="h-4 w-4" /> Add task
          </Button>
        )}
      </div>
    </div>
  );
});
