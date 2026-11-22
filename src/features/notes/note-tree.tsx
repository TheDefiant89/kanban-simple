import { memo } from "react";
import {
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  ListChecks,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { NoteTreeNode } from "@/features/notes/wikilinks";
import type { NoteTask } from "@/services/notes";
import type { Note } from "@/types";

export interface NoteTreeActions {
  onOpen: (node: NoteTreeNode) => void;
  onToggle: (key: string) => void;
  onCreateChild: (parentTitle: string) => void;
  onConvert: (note: Note) => void;
  onDelete: (note: Note) => void;
}

interface NoteTreeProps extends NoteTreeActions {
  nodes: NoteTreeNode[];
  activeId: string | null;
  expanded: Record<string, true>;
  /** Searching: every folder is shown open. */
  forceExpanded: boolean;
  draftIds: Set<string>;
  tasksByNote: Map<string, NoteTask[]>;
  depth?: number;
}

export function NoteTree(props: NoteTreeProps) {
  const { nodes, depth = 0 } = props;
  return (
    <ul role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? "Notes" : undefined}>
      {nodes.map((node) => (
        <NoteTreeItem key={node.key} {...props} node={node} depth={depth} />
      ))}
    </ul>
  );
}

const NoteTreeItem = memo(function NoteTreeItem(
  props: NoteTreeProps & { node: NoteTreeNode; depth: number }
) {
  const {
    node,
    depth,
    activeId,
    expanded,
    forceExpanded,
    draftIds,
    tasksByNote,
    onOpen,
    onToggle,
    onCreateChild,
    onConvert,
    onDelete,
  } = props;
  const isFolder = node.children.length > 0;
  const isOpen = isFolder && (forceExpanded || !!expanded[node.key]);
  const isGhost = node.note === null;
  const active = node.note !== null && node.note.id === activeId;
  const tasks = node.note ? tasksByNote.get(node.note.id) : undefined;
  const task = tasks?.[0];
  const hasDraft = node.note !== null && draftIds.has(node.note.id);

  const Icon = isFolder ? (isOpen ? FolderOpen : Folder) : FileText;

  return (
    <li role="treeitem" aria-expanded={isFolder ? isOpen : undefined} aria-selected={active}>
      <div
        className={cn(
          "group relative flex h-9 items-center gap-1 rounded-[9px] pr-1 text-sm transition-colors sm:h-8",
          active
            ? "bg-[color-mix(in_oklch,var(--accent-solid)_14%,transparent)] text-foreground"
            : "hover:bg-[color-mix(in_oklch,var(--foreground)_7%,transparent)]"
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        {active && (
          <span className="neon-sm absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[var(--accent-solid)]" />
        )}
        <button
          type="button"
          tabIndex={isFolder ? 0 : -1}
          aria-label={isOpen ? `Collapse ${node.title}` : `Expand ${node.title}`}
          onClick={() => isFolder && onToggle(node.key)}
          className={cn(
            "flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground",
            !isFolder && "invisible"
          )}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform duration-150", isOpen && "rotate-90")}
          />
        </button>
        <button
          type="button"
          onClick={() => onOpen(node)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 self-stretch text-left outline-none focus-visible:underline",
            isGhost && "italic text-muted-foreground"
          )}
          title={isGhost ? `"${node.title}" doesn't exist yet — click to create it` : node.title}
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              isFolder ? "text-[var(--accent-solid)]" : "text-muted-foreground",
              isGhost && "opacity-60"
            )}
          />
          <span className={cn("truncate", active && "font-semibold", isGhost && "opacity-80")}>
            {node.title}
          </span>
          {hasDraft && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            />
          )}
        </button>

        {task && (
          <span
            className="flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              color: task.project?.color,
              borderColor: `${task.project?.color ?? "#888"}55`,
              backgroundColor: `${task.project?.color ?? "#888"}1f`,
            }}
            title={`Task in ${task.project?.name ?? "a project"}${task.completed_at ? " (done)" : ""}`}
          >
            <ListChecks className="h-3 w-3" />
            {task.subtask_count > 0 ? `${task.subtask_done}/${task.subtask_count}` : "Task"}
          </span>
        )}
        {isFolder && !task && (
          <span className="shrink-0 rounded-full border bg-panel-2 px-1.5 text-[10px] font-semibold text-muted-foreground">
            {node.children.length}
          </span>
        )}

        <div className="flex shrink-0 items-center pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onCreateChild(node.title)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:h-6 sm:w-6"
            aria-label={`New sub-note in ${node.title}`}
            title="New sub-note"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
          {node.note && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:h-6 sm:w-6"
                  aria-label={`Actions for ${node.title}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onCreateChild(node.title)}>
                  <FilePlus2 className="h-4 w-4" /> New sub-note
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onConvert(node.note!)}>
                  <ListChecks className="h-4 w-4" />
                  {task ? "Update task" : "Convert to task"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(node.note!)}>
                  <Trash2 className="h-4 w-4" /> Delete note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="relative">
          <span
            className="absolute bottom-1 top-0 w-px bg-border"
            style={{ left: 4 + depth * 14 + 10 }}
            aria-hidden
          />
          <NoteTree {...props} nodes={node.children} depth={depth + 1} />
        </div>
      )}
    </li>
  );
});
