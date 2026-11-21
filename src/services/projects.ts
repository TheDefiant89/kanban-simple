import { supabase } from "@/supabase/client";
import type { Project } from "@/types";
import { DEFAULT_COLUMNS } from "@/types";
import { slugify } from "@/lib/utils";
import { currentUserId } from "@/services/session";

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
  // One query for every potentially-colliding slug instead of probing
  // candidates one round trip at a time. `base` is [a-z0-9-] only, so it
  // contains no LIKE metacharacters.
  let query = supabase
    .from("projects")
    .select("slug")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .like("slug", `${base}%`);
  if (excludeProjectId) query = query.neq("id", excludeProjectId);
  const { data, error } = await query;
  if (error) throw error;

  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(base)) return base;
  let attempt = 2;
  while (taken.has(`${base}-${attempt}`)) attempt += 1;
  return `${base}-${attempt}`;
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

const PROJECT_NAME_MAX = 80;

/**
 * Finds a name that doesn't collide (case-insensitively) with one of the
 * user's other active projects — the unique (user_id, lower(name)) index only
 * covers non-archived projects — appending " 2", " 3", ... on collision. The
 * base is trimmed so the result stays within the 80-character DB cap.
 */
async function uniqueNameFor(
  base: string,
  userId: string,
  excludeProjectId?: string
): Promise<string> {
  // The ILIKE may over-match if the name contains % or _, which only adds
  // rows to the taken-set; the exact comparison below stays correct.
  let query = supabase
    .from("projects")
    .select("name")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .ilike("name", `${base.slice(0, PROJECT_NAME_MAX - 4)}%`);
  if (excludeProjectId) query = query.neq("id", excludeProjectId);
  const { data, error } = await query;
  if (error) throw error;

  const taken = new Set((data ?? []).map((row) => row.name.toLowerCase()));
  const fit = (suffix: string) => `${base.slice(0, PROJECT_NAME_MAX - suffix.length).trimEnd()}${suffix}`;
  let name = fit("");
  let attempt = 1;
  while (taken.has(name.toLowerCase())) {
    attempt += 1;
    name = fit(` ${attempt}`);
  }
  return name;
}

export async function createProject(input: {
  name: string;
  description?: string;
  color: string;
}): Promise<Project> {
  const userId = await currentUserId();
  const name = input.name.trim();
  const slug = await uniqueSlugFor(name, userId);

  // Project + default columns in one transaction, so a failure can't leave
  // a project without columns behind.
  const { data, error } = await supabase.rpc("create_project_with_columns", {
    p_name: name,
    p_slug: slug,
    p_description: input.description?.trim() || null,
    p_color: input.color,
    p_columns: DEFAULT_COLUMNS.map((column) => ({ name: column.name, color: column.color })),
  });
  if (error) throw error;
  return data;
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, "name" | "description" | "color" | "is_archived">>
): Promise<Project> {
  const patch: Partial<Project> = { ...updates };

  if (updates.name) {
    const userId = await currentUserId();
    patch.slug = await uniqueSlugFor(updates.name, userId, projectId);
  } else if (updates.is_archived === false) {
    // Unarchiving: names and slugs are only unique among active projects, so
    // another project may have taken this one's name or slug while it was
    // archived. Pick free ones instead of failing on the unique index.
    const userId = await currentUserId();
    const current = await getProject(projectId);
    patch.name = await uniqueNameFor(current.name, userId, projectId);
    patch.slug = await uniqueSlugFor(patch.name, userId, projectId);
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
  const userId = await currentUserId();
  const name = await uniqueNameFor(`${project.name} (copy)`, userId);
  const slug = await uniqueSlugFor(name, userId);

  // Columns, non-archived tasks, subtasks and tags are copied server-side in
  // one transaction, so a failure part-way can't leave a half-copied project.
  const { data, error } = await supabase.rpc("duplicate_project", {
    p_source_id: project.id,
    p_name: name,
    p_slug: slug,
  });
  if (error) throw error;
  return data;
}
