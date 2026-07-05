import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-client";
import { isOverdue } from "@/lib/dates";
import type { ProjectWithStats } from "@/types";
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  updateProject,
} from "@/services/projects";
import { listTaskStatsForUser } from "@/services/tasks";
import { listColumns } from "@/services/columns";
import { listTasks } from "@/services/tasks";
import type { Project } from "@/types";

export function useProjectsWithStats(includeArchived = false) {
  return useQuery({
    queryKey: [...queryKeys.projects, { includeArchived }],
    queryFn: async (): Promise<ProjectWithStats[]> => {
      const [projects, taskStats] = await Promise.all([
        listProjects(includeArchived),
        listTaskStatsForUser(),
      ]);

      // Single pass over the task rows instead of three filters per project.
      const statsByProject = new Map<
        string,
        { taskCount: number; completedCount: number; overdueCount: number }
      >();
      for (const task of taskStats) {
        let stats = statsByProject.get(task.project_id);
        if (!stats) {
          stats = { taskCount: 0, completedCount: 0, overdueCount: 0 };
          statsByProject.set(task.project_id, stats);
        }
        stats.taskCount += 1;
        if (task.completed_at) stats.completedCount += 1;
        else if (isOverdue(task.due_date, task.completed_at)) stats.overdueCount += 1;
      }

      return projects.map((project) => ({
        ...project,
        taskCount: 0,
        completedCount: 0,
        overdueCount: 0,
        ...statsByProject.get(project.id),
      }));
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
    onError: (error: Error) => toast.error(error.message || "Failed to create project"),
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
    onError: (error: Error) => toast.error(error.message || "Failed to update project"),
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
    onError: (error: Error) => toast.error(error.message || "Failed to delete project"),
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
    onError: (error: Error) => toast.error(error.message || "Failed to duplicate project"),
  });
}
