import { useEffect, useMemo, useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryKeys } from "@/lib/query-client";
import { listProjects } from "@/services/projects";
import { listColumns } from "@/services/columns";
import type { NoteTask } from "@/services/notes";
import { useNoteMutations } from "@/features/notes/use-notes";
import { subNotesOf, type NoteTreeNode } from "@/features/notes/wikilinks";
import { taskHref } from "@/features/notes/note-utils";
import { useNotesStore } from "@/store/notes-store";

interface ConvertNoteDialogProps {
  node: NoteTreeNode | null;
  /** Tasks already made from this note. */
  tasks: NoteTask[];
  onOpenChange: (open: boolean) => void;
}

export function ConvertNoteDialog({ node, tasks, onOpenChange }: ConvertNoteDialogProps) {
  const open = !!node;
  const navigate = useNavigate();
  const mutations = useNoteMutations();
  const setPanelOpen = useNotesStore((s) => s.setOpen);
  const boardMatch = useMatch("/board/:slug");
  const currentSlug = boardMatch?.params.slug;

  const [nested, setNested] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [columnId, setColumnId] = useState("");

  const projectsQuery = useQuery({
    queryKey: [...queryKeys.projects, "picker"],
    queryFn: () => listProjects(false),
    enabled: open,
  });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const columnsQuery = useQuery({
    queryKey: queryKeys.columns(projectId),
    queryFn: () => listColumns(projectId),
    enabled: open && !!projectId,
  });
  const columns = useMemo(
    () => [...(columnsQuery.data ?? [])].sort((a, b) => a.position - b.position),
    [columnsQuery.data]
  );

  // Default to the board being viewed, else the most recently updated project.
  useEffect(() => {
    if (!open || projects.length === 0) return;
    setProjectId((current) => {
      if (current && projects.some((p) => p.id === current)) return current;
      return (projects.find((p) => p.slug === currentSlug) ?? projects[0]).id;
    });
  }, [open, projects, currentSlug]);

  useEffect(() => {
    if (columns.length === 0) return;
    setColumnId((current) =>
      columns.some((c) => c.id === current) ? current : (columns[0]?.id ?? "")
    );
  }, [columns]);

  useEffect(() => {
    if (open) setNested(false);
  }, [open, node?.key]);

  const hasNested = !!node?.children.some((child) => child.children.length > 0);
  const subNotes = useMemo(() => (node ? subNotesOf(node, nested) : []), [node, nested]);
  const existing = tasks[0];

  const openTask = (slug: string, taskId: string) => {
    // On phones the panel covers the board; get it out of the way.
    if (window.matchMedia("(max-width: 767px)").matches) setPanelOpen(false);
    navigate(taskHref(slug, taskId));
  };

  const handleConvert = async () => {
    if (!node?.note || !columnId) return;
    const project = projects.find((p) => p.id === projectId);
    try {
      const taskId = await mutations.convert.mutateAsync({
        noteId: node.note.id,
        projectId,
        columnId,
        childNoteIds: subNotes.map((n) => n.id),
      });
      onOpenChange(false);
      toast.success(
        subNotes.length > 0
          ? `Task created with ${subNotes.length} subtask${subNotes.length === 1 ? "" : "s"}`
          : "Task created",
        project
          ? { action: { label: "Open", onClick: () => openTask(project.slug, taskId) } }
          : undefined
      );
    } catch {
      // Toasted by the mutation.
    }
  };

  const handleSync = async () => {
    if (!existing) return;
    try {
      const added = await mutations.sync.mutateAsync({
        task: existing,
        childNoteIds: subNotes.map((n) => n.id),
      });
      onOpenChange(false);
      toast.success(
        added === 0
          ? "Subtasks are already up to date"
          : `Added ${added} subtask${added === 1 ? "" : "s"}`
      );
    } catch {
      // Toasted by the mutation.
    }
  };

  const pending = mutations.convert.isPending || mutations.sync.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-[var(--accent-solid)]" />
            {existing ? "Update task" : "Convert to task"}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? "This note is already a task. Sub-notes added since become new subtasks."
              : "The note becomes a task and each sub-note a subtask. They stay linked: renaming a note renames its task."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border bg-panel p-3">
            <p className="font-display truncate text-sm font-semibold">{node?.title}</p>
            {subNotes.length > 0 ? (
              <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto scrollbar-thin">
                {subNotes.map((n) => (
                  <li key={n.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{n.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                No sub-notes yet. A note becomes a sub-note when its first line links to [[
                {node?.title}]].
              </p>
            )}
          </div>

          {hasNested && (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                Include nested sub-notes
                <span className="block text-xs text-muted-foreground">
                  Sub-notes of sub-notes become subtasks too.
                </span>
              </span>
              <Switch checked={nested} onCheckedChange={setNested} />
            </label>
          )}

          {existing ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{existing.title}</span>
                <span className="text-xs text-muted-foreground">
                  {existing.project?.name} · {existing.subtask_done}/{existing.subtask_count}{" "}
                  subtasks done
                </span>
              </span>
              {existing.project && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    openTask(existing.project!.slug, existing.id);
                  }}
                >
                  Open
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder={projectsQuery.isLoading ? "Loading…" : "Pick one"} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label>Column</Label>
                <Select value={columnId} onValueChange={setColumnId} disabled={!projectId}>
                  <SelectTrigger>
                    <SelectValue placeholder={columnsQuery.isLoading ? "Loading…" : "Pick one"} />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {projectsQuery.isSuccess && projects.length === 0 && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  Create a project first — tasks live on a project's board.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {existing ? (
            <Button onClick={handleSync} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add missing subtasks
            </Button>
          ) : (
            <Button onClick={handleConvert} disabled={pending || !columnId}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create task
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
