import { supabase } from "@/supabase/client";
import { fetchAllPages } from "@/lib/fetch-all";
import type { Note } from "@/types";

// user_id is filled in by the database's auth.uid() default.

export async function listNotes(): Promise<Note[]> {
  const rows = await fetchAllPages<Note>((from, to) =>
    supabase.from("notes").select("*").order("id", { ascending: true }).range(from, to)
  );
  return rows;
}

/** Postgres unique_violation on (user_id, lower(title)) gets a readable message. */
function noteError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("A note with that title already exists");
  return new Error(error.message);
}

export async function createNote(input: { title: string; content?: string }): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .insert({ title: input.title.trim(), content: input.content ?? "" })
    .select()
    .single();
  if (error) throw noteError(error);
  return data;
}

export async function updateNote(
  noteId: string,
  updates: Partial<Pick<Note, "title" | "content">>
): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .update(updates.title === undefined ? updates : { ...updates, title: updates.title.trim() })
    .eq("id", noteId)
    .select()
    .single();
  if (error) throw noteError(error);
  return data;
}

export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", noteId);
  if (error) throw error;
}

/** A task created from a note, with enough of its project to link to it. */
export interface NoteTask {
  id: string;
  note_id: string;
  title: string;
  completed_at: string | null;
  project_id: string;
  project: { name: string; slug: string; color: string } | null;
  subtask_count: number;
  subtask_done: number;
}

type RawNoteTask = Omit<NoteTask, "project" | "subtask_count" | "subtask_done"> & {
  projects: NoteTask["project"];
  subtasks: { is_completed: boolean }[];
};

/** Every active task that was created from a note. */
export async function listNoteTasks(): Promise<NoteTask[]> {
  const rows = await fetchAllPages<RawNoteTask>(
    (from, to) =>
      supabase
        .from("tasks")
        .select(
          "id, note_id, title, completed_at, project_id, projects(name, slug, color), subtasks(is_completed)"
        )
        .not("note_id", "is", null)
        .eq("is_archived", false)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: RawNoteTask[] | null; error: unknown }>
  );
  return rows.map(({ projects, subtasks, ...task }) => ({
    ...task,
    project: projects,
    subtask_count: subtasks.length,
    subtask_done: subtasks.filter((s) => s.is_completed).length,
  }));
}

/** Creates a task from a note, with one subtask per sub-note. Returns the task id. */
export async function convertNoteToTask(input: {
  noteId: string;
  columnId: string;
  childNoteIds: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("convert_note_to_task", {
    p_note_id: input.noteId,
    p_column_id: input.columnId,
    p_child_note_ids: input.childNoteIds,
  });
  if (error) throw error;
  return data;
}

/** Adds subtasks for sub-notes the task doesn't have yet. Returns how many were added. */
export async function syncNoteTaskSubtasks(
  taskId: string,
  childNoteIds: string[]
): Promise<number> {
  const { data, error } = await supabase.rpc("sync_note_task_subtasks", {
    p_task_id: taskId,
    p_child_note_ids: childNoteIds,
  });
  if (error) throw error;
  return data;
}
