import { useMemo, useRef, useState, type RefObject } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ArrowLeft, LayoutGrid, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ColumnComponent } from "@/features/board/column";
import { ColumnDialog } from "@/features/board/column-dialog";
import { BoardToolbar } from "@/features/board/board-toolbar";
import { TaskCard } from "@/features/board/task-card";
import { TaskDetailDialog } from "@/features/tasks/task-detail-dialog";
import { useBoardData, useColumnMutations, useTaskMutations } from "@/features/board/use-board";
import { useTags } from "@/features/board/use-tags";
import { useFilterStore } from "@/store/filter-store";
import { matchesFilters } from "@/lib/task-filters";
import type { Column, ColumnWithTasks, TaskWithRelations } from "@/types";

export default function Board() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId ?? "";

  const { project, columns, isLoading } = useBoardData(projectId);
  const columnMutations = useColumnMutations(projectId);
  const taskMutations = useTaskMutations(projectId);
  const { data: tags = [] } = useTags();
  const filters = useFilterStore((s) => s.getFilters(projectId));
  const setDue = useFilterStore((s) => s.setDue);
  const setShowCompleted = useFilterStore((s) => s.setShowCompleted);
  const togglePriority = useFilterStore((s) => s.togglePriority);
  const toggleTag = useFilterStore((s) => s.toggleTag);
  const setSearch = useFilterStore((s) => s.setSearch);

  const [items, setItems] = useState<ColumnWithTasks[]>([]);
  const [activeTask, setActiveTask] = useState<TaskWithRelations | null>(null);
  const [activeColumn, setActiveColumn] = useState<ColumnWithTasks | null>(null);
  const originalColumnId = useRef<string | null>(null);

  const [columnDialogOpen, setColumnDialogOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [deletingColumn, setDeletingColumn] = useState<Column | null>(null);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [defaultColumnId, setDefaultColumnId] = useState<string | undefined>(undefined);

  const displayColumns = useMemo(
    () => columns.map((c) => ({ ...c, tasks: c.tasks.filter((t) => matchesFilters(t, filters)) })),
    [columns, filters]
  );

  const isDragging = useRef(false);
  useMemoSync(displayColumns, isDragging, setItems);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    isDragging.current = true;
    const type = event.active.data.current?.type;
    if (type === "task") {
      const task = event.active.data.current?.task as TaskWithRelations;
      setActiveTask(task);
      originalColumnId.current = task.column_id;
    } else if (type === "column") {
      setActiveColumn(event.active.data.current?.column as ColumnWithTasks);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "task") return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    setItems((prev) => {
      const fromColIdx = prev.findIndex((c) => c.tasks.some((t) => t.id === activeId));
      if (fromColIdx === -1) return prev;

      let toColIdx = prev.findIndex((c) => c.tasks.some((t) => t.id === overId));
      if (toColIdx === -1) {
        const colId = overId.startsWith("dropzone::") ? overId.slice("dropzone::".length) : overId;
        toColIdx = prev.findIndex((c) => c.id === colId);
      }
      if (toColIdx === -1 || fromColIdx === toColIdx) return prev;

      const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
      const fromTasks = next[fromColIdx].tasks;
      const toTasks = next[toColIdx].tasks;
      const activeIndex = fromTasks.findIndex((t) => t.id === activeId);
      const [moved] = fromTasks.splice(activeIndex, 1);
      const overIndex = toTasks.findIndex((t) => t.id === overId);
      const insertAt = overIndex >= 0 ? overIndex : toTasks.length;
      toTasks.splice(insertAt, 0, { ...moved, column_id: next[toColIdx].id });
      return next;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    isDragging.current = false;
    const { active, over } = event;
    const activeType = active.data.current?.type;
    setActiveTask(null);
    setActiveColumn(null);

    if (!over) return;

    if (activeType === "column") {
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;
      setItems((prev) => {
        const oldIndex = prev.findIndex((c) => c.id === activeId);
        const newIndex = prev.findIndex((c) => c.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const reordered = arrayMove(prev, oldIndex, newIndex);
        columnMutations.reorder.mutate(reordered.map((c, i) => ({ id: c.id, position: i })));
        return reordered;
      });
      return;
    }

    if (activeType === "task") {
      const activeId = String(active.id);
      const overId = String(over.id);

      setItems((prev) => {
        const fromColIdx = prev.findIndex((c) => c.tasks.some((t) => t.id === activeId));
        if (fromColIdx === -1) return prev;

        const next = prev.map((c) => ({ ...c, tasks: [...c.tasks] }));
        const tasksInCol = next[fromColIdx].tasks;
        const activeIndex = tasksInCol.findIndex((t) => t.id === activeId);
        const overIndex = tasksInCol.findIndex((t) => t.id === overId);

        if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
          next[fromColIdx].tasks = arrayMove(tasksInCol, activeIndex, overIndex);
        }

        const currentColumnId = next[fromColIdx].id;
        const affectedColumnIds = new Set(
          [currentColumnId, originalColumnId.current].filter(Boolean) as string[]
        );

        affectedColumnIds.forEach((colId) => {
          const col = next.find((c) => c.id === colId);
          if (!col) return;
          taskMutations.reorder.mutate(
            col.tasks.map((t, i) => ({ id: t.id, position: i, column_id: col.id }))
          );
        });

        return next;
      });
      originalColumnId.current = null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[70vh] w-72 shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Project not found"
        description="It may have been deleted or you don't have access to it."
        action={
          <Button asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard" aria-label="Back to dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
        <h1 className="truncate text-lg font-semibold">{project.name}</h1>
      </div>

      <BoardToolbar
        filters={filters}
        tags={tags}
        onSearchChange={(v) => setSearch(projectId, v)}
        onDueChange={(v) => setDue(projectId, v)}
        onTogglePriority={(p) => togglePriority(projectId, p)}
        onToggleTag={(id) => toggleTag(projectId, id)}
        onShowCompletedChange={(v) => setShowCompleted(projectId, v)}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 items-start gap-3 overflow-x-auto p-4 scrollbar-thin">
          <SortableContext items={items.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            {items.map((column) => (
              <ColumnComponent
                key={column.id}
                column={column}
                onAddTask={() => {
                  setEditingTask(null);
                  setDefaultColumnId(column.id);
                  setTaskDialogOpen(true);
                }}
                onOpenTask={(task) => {
                  setEditingTask(task);
                  setTaskDialogOpen(true);
                }}
                onToggleComplete={(task, completed) =>
                  taskMutations.setCompleted.mutate({ task, completed })
                }
                onRename={() => {
                  setEditingColumn(column);
                  setColumnDialogOpen(true);
                }}
                onDelete={() => setDeletingColumn(column)}
                onToggleCollapse={() =>
                  columnMutations.update.mutate({
                    columnId: column.id,
                    updates: { is_collapsed: !column.is_collapsed },
                  })
                }
              />
            ))}
          </SortableContext>

          <Button
            variant="outline"
            className="h-11 w-72 shrink-0 justify-start border-dashed text-muted-foreground"
            onClick={() => {
              setEditingColumn(null);
              setColumnDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add column
          </Button>
        </div>

        <DragOverlay>
          {activeTask && (
            <TaskCard task={activeTask} onClick={() => {}} onToggleComplete={() => {}} dragging />
          )}
          {activeColumn && (
            <div className="w-72 rounded-xl border bg-card p-3 shadow-lg">
              <p className="text-sm font-semibold">{activeColumn.name}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ColumnDialog
        open={columnDialogOpen}
        onOpenChange={setColumnDialogOpen}
        column={editingColumn}
        submitting={columnMutations.create.isPending || columnMutations.update.isPending}
        onSubmit={async (values) => {
          if (editingColumn) {
            await columnMutations.update.mutateAsync({
              columnId: editingColumn.id,
              updates: values,
            });
          } else {
            await columnMutations.create.mutateAsync({
              projectId,
              name: values.name,
              color: values.color,
              position: columns.length,
            });
          }
        }}
      />

      <AlertDialog
        open={!!deletingColumn}
        onOpenChange={(open) => !open && setDeletingColumn(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingColumn?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the column and all tasks inside it. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingColumn) columnMutations.remove.mutate(deletingColumn.id);
                setDeletingColumn(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskDetailDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        task={editingTask}
        projectId={projectId}
        columns={columns}
        defaultColumnId={defaultColumnId}
      />
    </div>
  );
}

// Keeps the local drag-and-drop mirror state in sync with fresh server/query
// data (or filter changes) without clobbering an in-flight drag reorder.
function useMemoSync(
  source: ColumnWithTasks[],
  isDragging: RefObject<boolean>,
  setState: (v: ColumnWithTasks[]) => void
) {
  const serialized = JSON.stringify(
    source.map((c) => [c.id, c.is_collapsed, c.tasks.map((t) => t.id)])
  );
  const prevRef = useRef<string>("");
  if (prevRef.current !== serialized && !isDragging.current) {
    prevRef.current = serialized;
    setState(source);
  }
}
