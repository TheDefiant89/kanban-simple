import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
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
import {
  useBoardData,
  useColumnMutations,
  useProjectBySlug,
  useTaskMutations,
} from "@/features/board/use-board";
import {
  buildPositionUpdates,
  mergeVisibleOrder,
  type TaskPositionUpdate,
} from "@/features/board/reorder";
import { useTags } from "@/features/board/use-tags";
import { useFilterStore } from "@/store/filter-store";
import { buildTaskPredicate } from "@/lib/task-filters";
import { useDocumentTitle } from "@/lib/use-document-title";
import type { Column, ColumnWithTasks, TaskWithRelations } from "@/types";

const noop = () => {};

export default function Board() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const slugLookup = useProjectBySlug(slug);
  const projectId = slugLookup.data?.id ?? "";

  const { project, columns, isLoading: boardDataLoading } = useBoardData(projectId);
  const isLoading = slugLookup.isLoading || (!!projectId && boardDataLoading);
  useDocumentTitle(project?.name);

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

  // Filtered view of the board. Column objects keep their identity when
  // their filtered contents haven't changed, so the memoised column/card
  // components below can skip re-rendering on updates that only affect
  // other columns (e.g. a search keystroke).
  const displayCache = useRef(
    new Map<string, { source: ColumnWithTasks; result: ColumnWithTasks }>()
  );
  const displayColumns = useMemo(() => {
    const matches = buildTaskPredicate(filters);
    const cache = displayCache.current;
    const nextCache = new Map<string, { source: ColumnWithTasks; result: ColumnWithTasks }>();
    const next = columns.map((column) => {
      const tasks = column.tasks.filter(matches);
      const hit = cache.get(column.id);
      const reusable =
        hit &&
        hit.source === column &&
        hit.result.tasks.length === tasks.length &&
        hit.result.tasks.every((task, i) => task === tasks[i]);
      const entry = reusable ? hit : { source: column, result: { ...column, tasks } };
      nextCache.set(column.id, entry);
      return entry.result;
    });
    displayCache.current = nextCache;
    return next;
  }, [columns, filters]);

  // Keep the local drag-and-drop mirror in sync with the memoised query
  // data unless a drag is in flight. Reference equality is sufficient
  // because useBoardData and displayColumns preserve identities when
  // nothing changed (render-phase derived-state reset pattern).
  const isDragging = useRef(false);
  const lastSynced = useRef<ColumnWithTasks[] | null>(null);
  if (lastSynced.current !== displayColumns && !isDragging.current) {
    lastSynced.current = displayColumns;
    setItems(displayColumns);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // While dragging a column, restrict collision candidates to other column
  // containers. Otherwise dnd-kit also considers every task and task-list
  // dropzone nested inside those columns — since a dragged column's rect
  // spans its full height, its closest corners usually land on a nested
  // task rather than the column itself, so `over.id` resolves to a task id
  // instead of a column id and the reorder in handleDragEnd silently no-ops.
  const collisionDetection: CollisionDetection = (args) => {
    if (args.active.data.current?.type === "column") {
      const columnContainers = args.droppableContainers.filter(
        (container) => container.data.current?.type === "column"
      );
      return closestCorners({ ...args, droppableContainers: columnContainers });
    }
    return closestCorners(args);
  };

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

      // Clone only the two affected columns; untouched columns keep their
      // identity so their memoised components skip re-rendering mid-drag.
      const fromTasks = [...prev[fromColIdx].tasks];
      const activeIndex = fromTasks.findIndex((t) => t.id === activeId);
      const [moved] = fromTasks.splice(activeIndex, 1);

      const toTasks = [...prev[toColIdx].tasks];
      const overIndex = toTasks.findIndex((t) => t.id === overId);
      const insertAt = overIndex >= 0 ? overIndex : toTasks.length;
      toTasks.splice(insertAt, 0, { ...moved, column_id: prev[toColIdx].id });

      const next = [...prev];
      next[fromColIdx] = { ...prev[fromColIdx], tasks: fromTasks };
      next[toColIdx] = { ...prev[toColIdx], tasks: toTasks };
      return next;
    });
  };

  // Ends a drag and marks the current data snapshot as seen (the mirror now
  // reflects the drop result; the optimistic reorder patch re-syncs it).
  // Returns whether query data changed mid-drag while syncing was suspended —
  // callers that end up persisting nothing must re-sync the mirror themselves
  // or that update would be lost until the next unrelated cache change.
  const resetDragState = () => {
    const dataChangedDuringDrag = lastSynced.current !== displayColumns;
    isDragging.current = false;
    setActiveTask(null);
    setActiveColumn(null);
    lastSynced.current = displayColumns;
    return dataChangedDuringDrag;
  };

  const handleDragCancel = () => {
    resetDragState();
    originalColumnId.current = null;
    setItems(displayColumns);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const dataChangedDuringDrag = resetDragState();
    const resyncIfStale = () => {
      if (dataChangedDuringDrag) setItems(displayColumns);
    };
    const { active, over } = event;
    const activeType = active.data.current?.type;

    if (!over) {
      // Dropped outside any droppable: undo the drag-over mirror changes.
      originalColumnId.current = null;
      setItems(displayColumns);
      return;
    }

    if (activeType === "column") {
      const activeId = String(active.id);
      const overId = String(over.id);
      const oldIndex = items.findIndex((c) => c.id === activeId);
      const newIndex = items.findIndex((c) => c.id === overId);
      if (activeId === overId || oldIndex === -1 || newIndex === -1) {
        resyncIfStale();
        return;
      }
      const reordered = arrayMove(items, oldIndex, newIndex);
      setItems(reordered);
      const updates = reordered
        .map((column, index) => ({ id: column.id, position: index }))
        .filter((u, index) => reordered[index].position !== u.position);
      if (updates.length > 0) columnMutations.reorder.mutate(updates);
      return;
    }

    if (activeType === "task") {
      const activeId = String(active.id);
      const overId = String(over.id);
      const movedFromColumnId = originalColumnId.current;
      originalColumnId.current = null;

      const colIdx = items.findIndex((c) => c.tasks.some((t) => t.id === activeId));
      if (colIdx === -1) {
        resyncIfStale();
        return;
      }

      // Apply the final same-column position adjustment to the mirror.
      let next = items;
      const tasksInCol = items[colIdx].tasks;
      const fromIndex = tasksInCol.findIndex((t) => t.id === activeId);
      const toIndex = tasksInCol.findIndex((t) => t.id === overId);
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        next = [...items];
        next[colIdx] = { ...items[colIdx], tasks: arrayMove(tasksInCol, fromIndex, toIndex) };
      }
      setItems(next);

      // Persist positions against the FULL task lists: the mirror only
      // holds tasks matching the active filters, and indexing filtered
      // lists would collide with hidden tasks' positions.
      const affectedIds = new Set(
        [next[colIdx].id, movedFromColumnId].filter(Boolean) as string[]
      );
      const tasksById = new Map(columns.flatMap((c) => c.tasks).map((t) => [t.id, t]));
      const updates: TaskPositionUpdate[] = [];
      for (const columnId of affectedIds) {
        const full = columns.find((c) => c.id === columnId);
        const visible = next.find((c) => c.id === columnId);
        if (!full || !visible) continue;
        const merged = mergeVisibleOrder(full.tasks, visible.tasks, activeId);
        updates.push(...buildPositionUpdates(merged, columnId, tasksById));
      }
      if (updates.length > 0) taskMutations.reorder.mutate(updates);
      else resyncIfStale();
    }
  };

  const handleAddTask = useCallback((columnId: string) => {
    setEditingTask(null);
    setDefaultColumnId(columnId);
    setTaskDialogOpen(true);
  }, []);

  const handleOpenTask = useCallback((task: TaskWithRelations) => {
    setEditingTask(task);
    setTaskDialogOpen(true);
  }, []);

  const setCompletedMutate = taskMutations.setCompleted.mutate;
  const handleToggleComplete = useCallback(
    (task: TaskWithRelations, completed: boolean) => setCompletedMutate({ task, completed }),
    [setCompletedMutate]
  );

  const handleRenameColumn = useCallback((column: Column) => {
    setEditingColumn(column);
    setColumnDialogOpen(true);
  }, []);

  const handleDeleteColumn = useCallback((column: Column) => setDeletingColumn(column), []);

  const updateColumnMutate = columnMutations.update.mutate;
  const handleToggleCollapse = useCallback(
    (column: Column) =>
      updateColumnMutate({
        columnId: column.id,
        updates: { is_collapsed: !column.is_collapsed },
      }),
    [updateColumnMutate]
  );

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
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
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto overflow-y-hidden p-4 scrollbar-thin">
          <SortableContext items={items.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            {items.map((column) => (
              <ColumnComponent
                key={column.id}
                column={column}
                onAddTask={handleAddTask}
                onOpenTask={handleOpenTask}
                onToggleComplete={handleToggleComplete}
                onRename={handleRenameColumn}
                onDelete={handleDeleteColumn}
                onToggleCollapse={handleToggleCollapse}
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
            <TaskCard task={activeTask} onOpen={noop} onToggleComplete={noop} dragging />
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
