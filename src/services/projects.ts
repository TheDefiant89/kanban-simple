import { supabase } from "@/supabase/client";
import type { Project, Task } from "@/types";
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

  // Avoid colliding with the unique (user_id, lower(name)) constraint on
  // active projects. One query for all candidate names; the pattern may
  // over-match if the name contains % or _, which only means extra rows in
  // the taken-set — the exact comparison below stays correct.
  const baseName = `${project.name} (copy)`;
  const { data: existing, error: existingError } = await supabase
    .from("projects")
    .select("name")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .ilike("name", `${baseName}%`);
  if (existingError) throw existingError;

  const takenNames = new Set((existing ?? []).map((row) => row.name.toLowerCase()));
  let name = baseName;
  let attempt = 1;
  while (takenNames.has(name.toLowerCase())) {
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

    // Correlate old -> new columns by position rather than array index:
    // PostgREST does not guarantee that the inserted rows come back in the
    // same order as the input, and positions are distinct within a project.
    const insertedColumnByPosition = new Map(insertedColumns.map((c) => [c.position, c.id]));
    const columnIdMap = new Map<string, string>();
    for (const old of columns) {
      const newId = insertedColumnByPosition.get(old.position);
      if (newId) columnIdMap.set(old.id, newId);
    }
    const fallbackColumnId = insertedColumns[0].id;

    // Pull the source tasks together with their subtasks and tags so the
    // duplicate carries them too (matching duplicateTask), instead of copying
    // only the bare task rows.
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("*, subtasks(*), task_tags(tag_id)")
      .eq("project_id", project.id)
      .eq("is_archived", false);
    if (tasksError) throw tasksError;

    type SourceTask = Task & {
      subtasks: { title: string; is_completed: boolean; position: number }[];
      task_tags: { tag_id: string }[];
    };
    const sourceTasks = (tasks ?? []) as unknown as SourceTask[];

    if (sourceTasks.length > 0) {
      const { data: insertedTasks, error: insertTasksError } = await supabase
        .from("tasks")
        .insert(
          sourceTasks.map((t) => ({
            project_id: newProject.id,
            column_id: columnIdMap.get(t.column_id) ?? fallbackColumnId,
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
        )
        .select();
      if (insertTasksError) throw insertTasksError;

      // Correlate old -> new tasks by (new column_id, position), which is
      // unique within the board, so subtasks/tags land on the right copies
      // regardless of the order PostgREST returns the inserted rows in.
      const insertedTaskByKey = new Map(
        insertedTasks.map((t) => [`${t.column_id}:${t.position}`, t.id])
      );
      const oldToNewTaskId = new Map<string, string>();
      for (const t of sourceTasks) {
        const newColumnId = columnIdMap.get(t.column_id) ?? fallbackColumnId;
        const newTaskId = insertedTaskByKey.get(`${newColumnId}:${t.position}`);
        if (newTaskId) oldToNewTaskId.set(t.id, newTaskId);
      }

      const subtaskRows = sourceTasks.flatMap((t) => {
        const newTaskId = oldToNewTaskId.get(t.id);
        if (!newTaskId) return [];
        return t.subtasks.map((s) => ({
          task_id: newTaskId,
          user_id: userId,
          title: s.title,
          is_completed: s.is_completed,
          position: s.position,
        }));
      });
      if (subtaskRows.length > 0) {
        const { error: insertSubtasksError } = await supabase.from("subtasks").insert(subtaskRows);
        if (insertSubtasksError) throw insertSubtasksError;
      }

      const tagRows = sourceTasks.flatMap((t) => {
        const newTaskId = oldToNewTaskId.get(t.id);
        if (!newTaskId) return [];
        return t.task_tags.map((tt) => ({
          task_id: newTaskId,
          tag_id: tt.tag_id,
          user_id: userId,
        }));
      });
      if (tagRows.length > 0) {
        const { error: insertTagsError } = await supabase.from("task_tags").insert(tagRows);
        if (insertTagsError) throw insertTagsError;
      }
    }
  }

  return newProject;
}
