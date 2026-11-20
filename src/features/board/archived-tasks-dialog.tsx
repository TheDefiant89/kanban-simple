import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { listArchivedTasks, updateTask } from "@/services/tasks";
import { queryKeys } from "@/lib/query-client";
import { formatDate } from "@/lib/dates";

interface ArchivedTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  columnNames: Map<string, string>;
}

/**
 * Lists a project's archived tasks. Nothing is fetched until the dialog is
 * opened, then 50 at a time, so archived work never weighs on the board.
 */
export function ArchivedTasksDialog({
  open,
  onOpenChange,
  projectId,
  columnNames,
}: ArchivedTasksDialogProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
    }
  }, [open]);

  const archived = useInfiniteQuery({
    queryKey: [...queryKeys.archivedTasks(projectId), debouncedSearch],
    queryFn: ({ pageParam }) => listArchivedTasks(projectId, pageParam, debouncedSearch),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length : undefined),
    enabled: open,
  });

  const unarchive = useMutation({
    mutationFn: (taskId: string) => updateTask(taskId, { is_archived: false }),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.archivedTasks(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success(`Restored "${task.title}"`);
    },
    onError: (error: Error) => toast.error(error.message || "Failed to unarchive task"),
  });

  const tasks = archived.data?.pages.flatMap((p) => p.tasks) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] flex-col sm:max-h-[85vh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Archived tasks</DialogTitle>
          <DialogDescription>
            Completed tasks are archived automatically after the number of days set in Settings.
            Restoring a task puts it back in its column.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archived tasks"
            aria-label="Search archived tasks"
            className="pl-8"
          />
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 scrollbar-thin">
          {archived.isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : archived.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {archived.error.message || "Failed to load archived tasks"}
            </p>
          ) : tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {debouncedSearch ? "No archived tasks match your search." : "No archived tasks."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {columnNames.get(task.column_id) ?? "Unknown column"}
                      {task.completed_at
                        ? ` · Completed ${formatDate(task.completed_at)}`
                        : ` · Archived ${formatDate(task.updated_at)}`}
                    </p>
                  </div>
                  <PriorityBadge priority={task.priority} />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={unarchive.isPending && unarchive.variables === task.id}
                    onClick={() => unarchive.mutate(task.id)}
                  >
                    {unarchive.isPending && unarchive.variables === task.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    )}
                    Unarchive
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {archived.hasNextPage && (
            <div className="flex justify-center py-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={archived.isFetchingNextPage}
                onClick={() => archived.fetchNextPage()}
              >
                {archived.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
