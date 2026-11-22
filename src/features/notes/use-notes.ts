import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import {
  convertNoteToTask,
  createNote,
  deleteNote,
  listNoteTasks,
  listNotes,
  syncNoteTaskSubtasks,
  updateNote,
  type NoteTask,
} from "@/services/notes";
import { buildNoteTree } from "@/features/notes/wikilinks";
import type { Note } from "@/types";

const NO_NOTES: Note[] = [];

export function useNotes(enabled = true) {
  const query = useQuery({ queryKey: queryKeys.notes, queryFn: listNotes, enabled });
  const notes = query.data ?? NO_NOTES;
  const tree = useMemo(() => buildNoteTree(notes), [notes]);
  return { ...query, notes, tree };
}

/** Active tasks created from notes, grouped by the note they came from. */
export function useNoteTasks(enabled = true) {
  const query = useQuery({ queryKey: queryKeys.noteTasks, queryFn: listNoteTasks, enabled });
  const byNote = useMemo(() => {
    const map = new Map<string, NoteTask[]>();
    for (const task of query.data ?? []) {
      const list = map.get(task.note_id);
      if (list) list.push(task);
      else map.set(task.note_id, [task]);
    }
    return map;
  }, [query.data]);
  return { ...query, byNote };
}

export function useNoteMutations() {
  const queryClient = useQueryClient();
  const setNotes = (fn: (old: Note[]) => Note[]) =>
    queryClient.setQueryData<Note[]>(queryKeys.notes, (old) => (old ? fn(old) : old));

  const create = useMutation({
    mutationFn: createNote,
    onSuccess: (note) => setNotes((old) => [...old, note]),
    meta: { errorMessage: "Failed to create note" },
  });

  const update = useMutation({
    mutationFn: ({
      note,
      updates,
    }: {
      note: Note;
      updates: Partial<Pick<Note, "title" | "content">>;
    }) => updateNote(note.id, updates),
    onSuccess: (saved, { note }) => {
      setNotes((old) => old.map((n) => (n.id === saved.id ? saved : n)));
      if (saved.title !== note.title) {
        // A rename rewrites [[links]] in other notes and retitles the tasks
        // and subtasks made from this note (see the notes migration).
        void queryClient.invalidateQueries({ queryKey: queryKeys.notes });
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
        void queryClient.invalidateQueries({ queryKey: queryKeys.noteTasks });
      }
    },
    meta: { errorMessage: "Failed to save note" },
  });

  const remove = useMutation({
    mutationFn: (noteId: string) => deleteNote(noteId),
    onSuccess: (_data, noteId) => {
      setNotes((old) => old.filter((n) => n.id !== noteId));
      // Linked tasks keep existing but lose their note link.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasksAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.noteTasks });
    },
    meta: { errorMessage: "Failed to delete note" },
  });

  const convert = useMutation({
    mutationFn: (input: {
      noteId: string;
      projectId: string;
      columnId: string;
      childNoteIds: string[];
    }) => convertNoteToTask(input),
    onSuccess: (_taskId, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.noteTasks });
    },
    meta: { errorMessage: "Failed to create the task" },
  });

  const sync = useMutation({
    mutationFn: ({ task, childNoteIds }: { task: NoteTask; childNoteIds: string[] }) =>
      syncNoteTaskSubtasks(task.id, childNoteIds),
    onSuccess: (_added, { task }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(task.project_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.noteTasks });
    },
    meta: { errorMessage: "Failed to update the subtasks" },
  });

  return { create, update, remove, convert, sync };
}
