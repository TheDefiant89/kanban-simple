import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Copy,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/dates";
import { usePrefetchBoard } from "@/features/dashboard/use-projects";
import type { ProjectWithStats } from "@/types";
import { cn } from "@/lib/utils";

interface ProjectTileProps {
  project: ProjectWithStats;
  onRename: () => void;
  onDuplicate: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function ProjectTile({
  project,
  onRename,
  onDuplicate,
  onArchiveToggle,
  onDelete,
}: ProjectTileProps) {
  const progress =
    project.taskCount > 0 ? Math.round((project.completedCount / project.taskCount) * 100) : 0;
  const boardUrl = `/board/${project.slug}`;

  // Warm the board's data caches on hover/focus so opening it is instant.
  const prefetchBoard = usePrefetchBoard();
  const prefetch = () => prefetchBoard(project);

  return (
    <Card
      className="group flex flex-col overflow-hidden transition-shadow hover:shadow-md"
      onMouseEnter={prefetch}
    >
      <div className="h-1.5 w-full" style={{ backgroundColor: project.color }} />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <Link to={boardUrl} className="min-w-0 flex-1" onFocus={prefetch}>
            <h3 className="truncate font-semibold leading-tight hover:underline">{project.name}</h3>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-1 h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100"
                aria-label="Project actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={boardUrl}>
                  <ListTodo className="h-4 w-4" /> Open
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onArchiveToggle}>
                {project.is_archived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" /> Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" /> Archive
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ListTodo className="h-3.5 w-3.5" /> {project.taskCount} tasks
            </span>
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {project.completedCount} done
            </span>
            {project.overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> {project.overdueCount} overdue
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className={cn(project.is_archived && "italic")}>
              {project.is_archived ? "Archived" : `Updated ${formatDate(project.updated_at)}`}
            </span>
            <span>Created {formatDate(project.created_at)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
