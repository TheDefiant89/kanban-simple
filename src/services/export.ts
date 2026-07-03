import { supabase } from "@/supabase/client";
import { listProjects } from "./projects";
import { listColumns } from "./columns";
import { listTasks } from "./tasks";
import { listTags } from "./tags";

export interface ExportedData {
  exportedAt: string;
  version: 1;
  tags: Awaited<ReturnType<typeof listTags>>;
  projects: {
    project: Awaited<ReturnType<typeof listProjects>>[number];
    columns: Awaited<ReturnType<typeof listColumns>>;
    tasks: Awaited<ReturnType<typeof listTasks>>;
  }[];
}

export async function exportUserData(): Promise<ExportedData> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Not authenticated");

  const [projects, tags] = await Promise.all([listProjects(true), listTags()]);

  const projectData = await Promise.all(
    projects.map(async (project) => {
      const [columns, tasks] = await Promise.all([
        listColumns(project.id),
        listTasks(project.id, true),
      ]);
      return { project, columns, tasks };
    })
  );

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    tags,
    projects: projectData,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
