import { useMemo, useState } from "react";
import { LayoutGrid, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { ProjectTile } from "@/features/dashboard/project-tile";
import { ProjectDialog } from "@/features/dashboard/project-dialog";
import {
  useCreateProject,
  useDeleteProject,
  useDuplicateProject,
  useProjectsWithStats,
  useUpdateProject,
} from "@/features/dashboard/use-projects";
import { useDocumentTitle } from "@/lib/use-document-title";
import type { ProjectSortKey, ProjectWithStats } from "@/types";

export default function Dashboard() {
  useDocumentTitle("Dashboard");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProjectSortKey>("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithStats | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectWithStats | null>(null);

  const { data: projects, isLoading } = useProjectsWithStats(true);
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const duplicateProject = useDuplicateProject();

  const filtered = useMemo(() => {
    if (!projects) return [];
    const query = search.trim().toLowerCase();
    return projects
      .filter((p) => (showArchived ? true : !p.is_archived))
      .filter(
        (p) =>
          !query ||
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
      )
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "created")
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [projects, search, sort, showArchived]);

  const openCreateDialog = () => {
    setEditingProject(null);
    setDialogOpen(true);
  };

  const openRenameDialog = (project: ProjectWithStats) => {
    setEditingProject(project);
    setDialogOpen(true);
  };

  const handleDialogSubmit = async (values: {
    name: string;
    description?: string;
    color: string;
  }) => {
    if (editingProject) {
      await updateProject.mutateAsync({
        projectId: editingProject.id,
        updates: {
          name: values.name,
          description: values.description || null,
          color: values.color,
        },
      });
    } else {
      await createProject.mutateAsync(values);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Organise your work into Kanban boards</p>
        </div>
        <Button onClick={openCreateDialog} className="hidden sm:inline-flex">
          <Plus className="h-4 w-4" /> New project
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Select value={sort} onValueChange={(v) => setSort(v as ProjectSortKey)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="created">Created date</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="show-archived" className="whitespace-nowrap text-sm font-normal">
              Archived
            </Label>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title={search ? "No projects match your search" : "No projects yet"}
          description={
            search
              ? "Try a different search term."
              : "Create your first project to start organising tasks."
          }
          action={
            !search && (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4" /> New project
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((project) => (
            <ProjectTile
              key={project.id}
              project={project}
              onRename={() => openRenameDialog(project)}
              onDuplicate={() => duplicateProject.mutate(project)}
              onArchiveToggle={() =>
                updateProject.mutate({
                  projectId: project.id,
                  updates: { is_archived: !project.is_archived },
                })
              }
              onDelete={() => setDeletingProject(project)}
            />
          ))}
        </div>
      )}

      <Button
        onClick={openCreateDialog}
        size="icon"
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg sm:hidden"
        aria-label="New project"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editingProject}
        onSubmit={handleDialogSubmit}
        submitting={createProject.isPending || updateProject.isPending}
      />

      <AlertDialog
        open={!!deletingProject}
        onOpenChange={(open) => !open && setDeletingProject(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingProject?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project along with all of its columns, tasks and
              subtasks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingProject) deleteProject.mutate(deletingProject.id);
                setDeletingProject(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
