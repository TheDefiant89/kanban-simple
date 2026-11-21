import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-client";
import { toLocalDateString } from "@/lib/dates";
import type { ProjectWithStats } from "@/types";
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  updateProject,
} from "@/services/projects";
import { listProjectTaskStats } from "@/services/tasks";
import { listColumns } from "@/services/columns";
import { listTasks } from "@/services/tasks";
import type { Project } from "@/types";

export function useProjectsWithStats(includeArchived = false) {
  return useQuery({
    queryKey: [...queryKeys.projects, { includeArchived }],
    queryFn: async (): Promise<ProjectWithStats[]> => {
      const [projects, stats] = await Promise.all([
        listProjects(includeArchived),
        listProjectTaskStats(toLocalDateString(new Date())),
      ]);
      const statsByProject = new Map(stats.map((s) => [s.project_id, s]));
      return projects.map((project) => {
        const s = statsByProject.get(project.id);
        return {
          ...project,
          taskCount: s?.task_count ?? 0,
          completedCount: s?.completed_count ?? 0,
          overdueCount: s?.overdue_count ?? 0,
        };
      });
    },
  });
}

/**
 * Warms the board caches for a project (columns, tasks, and both project
 * lookups) so navigating from a dashboard tile to its board renders
 * instantly. Safe to call repeatedly — prefetchQuery dedupes in-flight
 * requests and respects staleTime.
 */
export function usePrefetchBoard() {
  const queryClient = useQueryClient();
  return (project: Project) => {
    queryClient.setQueryData(queryKeys.projectBySlug(project.slug), project);
    queryClient.setQueryData(queryKeys.project(project.id), project);
    void queryClient.prefetchQuery({
      queryKey: queryKeys.columns(project.id),
      queryFn: () => listColumns(project.id),
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.tasks(project.id),
      queryFn: () => listTasks(project.id),
    });
  };
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success("Project created");
    },
    meta: { errorMessage: "Failed to create project" },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      updates,
    }: {
      projectId: string;
      updates: Partial<Pick<Project, "name" | "description" | "color" | "is_archived">>;
    }) => updateProject(projectId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
    meta: { errorMessage: "Failed to update project" },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success("Project deleted");
    },
    meta: { errorMessage: "Failed to delete project" },
  });
}

export function useDuplicateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: duplicateProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success("Project duplicated");
    },
    meta: { errorMessage: "Failed to duplicate project" },
  });
}
