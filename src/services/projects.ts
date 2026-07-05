import { supabase } from "@/supabase/client";
import type { Project } from "@/types";
import { DEFAULT_COLUMNS } from "@/types";
import { slugify } from "@/lib/utils";

/**
 * Finds a slug for `name` that isn't already used by one of the user's other
 * active projects, appending -2, -3, ... on collision — mirrors the
 * (user_id, lower(name)) uniqueness handling in duplicateProject below, but
 * against the (user_id, slug) unique index.
 */
async function uniqueSlugFor(
  name: string,
  userId: string,
  excludeProjectId?: string
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let attempt = 1;
  while (true) {
    let query = supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .eq("slug", candidate);
    if (excludeProjectId) query = query.neq("id", excludeProjectId);
    const { data: existing } = await query.maybeSingle();
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

export async function listProjects(includeArchived = false): Promise<Project[]> {
  let query = supabase.from("projects").select("*").order("updated_at", { ascending: false });
  if (!includeArchived) query = query.eq("is_archived", false);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getProject(projectId: string): Promise<Project> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).single();
  if (error) throw error;
  return data;
}

export async function getProjectBySlug(slug: string): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .eq("is_archived", false)
    .single();
  if (error) throw error;
  return data;
}

export async function createProject(input: {
  name: string;
  description?: string;
  color: string;
}): Promise<Project> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const name = input.name.trim();
  const slug = await uniqueSlugFor(name, userId);

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name,
      slug,
      description: input.description?.trim() || null,
      color: input.color,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: columnsError } = await supabase.from("columns").insert(
    DEFAULT_COLUMNS.map((column, index) => ({
      project_id: project.id,
      user_id: userId,
      name: column.name,
      color: column.color,
      position: index,
    }))
  );
  if (columnsError) throw columnsError;

  return project;
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, "name" | "description" | "color" | "is_archived">>
): Promise<Project> {
  const patch: Partial<Project> = { ...updates };

  if (updates.name) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const userId = userData.user?.id;
    if (!userId) throw new Error("Not authenticated");
    patch.slug = await uniqueSlugFor(updates.name, userId, projectId);
  }

  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

export async function duplicateProject(project: Project): Promise<Project> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const baseName = `${project.name} (copy)`;
  let name = baseName;
  let attempt = 1;
  // Avoid colliding with the unique (user_id, lower(name)) constraint on active projects.
  while (true) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .ilike("name", name)
      .maybeSingle();
    if (!existing) break;
    attempt += 1;
    name = `${baseName} ${attempt}`;
  }
  const slug = await uniqueSlugFor(name, userId);

  const { data: newProject, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name,
      slug,
      description: project.description,
      color: project.color,
    })
    .select()
    .single();
  if (error) throw error;

  const { data: columns, error: columnsError } = await supabase
    .from("columns")
    .select("*")
    .eq("project_id", project.id)
    .order("position", { ascending: true });
  if (columnsError) throw columnsError;

  if (columns && columns.length > 0) {
    const { data: insertedColumns, error: insertColumnsError } = await supabase
      .from("columns")
      .insert(
        columns.map((c) => ({
          project_id: newProject.id,
          user_id: userId,
          name: c.name,
          color: c.color,
          position: c.position,
          is_collapsed: c.is_collapsed,
        }))
      )
      .select();
    if (insertColumnsError) throw insertColumnsError;

    const columnIdMap = new Map(columns.map((old, i) => [old.id, insertedColumns[i].id]));

    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", project.id)
      .eq("is_archived", false);
    if (tasksError) throw tasksError;

    if (tasks && tasks.length > 0) {
      const { error: insertTasksError } = await supabase.from("tasks").insert(
        tasks.map((t) => ({
          project_id: newProject.id,
          column_id: columnIdMap.get(t.column_id) ?? Array.from(columnIdMap.values())[0],
          user_id: userId,
          title: t.title,
          description: t.description,
          position: t.position,
          priority: t.priority,
          start_date: t.start_date,
          due_date: t.due_date,
          recurrence_type: t.recurrence_type,
          recurrence_cron: t.recurrence_cron,
        }))
      );
      if (insertTasksError) throw insertTasksError;
    }
  }

  return newProject;
}
