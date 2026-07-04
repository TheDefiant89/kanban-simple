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
import type { Project } from "@/types";

export function useProjectsWithStats(includeArchived = false) {
  return useQuery({
    queryKey: [...queryKeys.projects, { includeArchived }],
    queryFn: async (): Promise<ProjectWithStats[]> => {
      const [projects, taskStats] = await Promise.all([
        listProjects(includeArchived),
        listTaskStatsForUser(),
      ]);

      return projects.map((project) => {
        const tasksForProject = taskStats.filter((t) => t.project_id === project.id);
        return {
          ...project,
          taskCount: tasksForProject.length,
          completedCount: tasksForProject.filter((t) => t.completed_at).length,
          overdueCount: tasksForProject.filter((t) => isOverdue(t.due_date, t.completed_at)).length,
        };
      });
    },
  });
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
