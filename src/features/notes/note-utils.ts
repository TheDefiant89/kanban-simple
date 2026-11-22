import { normalizeTitle, TITLE_FORBIDDEN, type NoteTree } from "@/features/notes/wikilinks";

/** Board URL that opens a task's dialog (see the ?task= handling in Board). */
export function taskHref(slug: string, taskId: string): string {
  return `/board/${slug}?task=${taskId}`;
}

export const NOTE_TITLE_MAX = 200;
export const NOTE_CONTENT_MAX = 100_000;

/** Why `title` can't be used for `noteId`, or null if it can. */
export function titleProblem(title: string, tree: NoteTree, noteId?: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "Give the note a title";
  if (trimmed.length > NOTE_TITLE_MAX) return `Keep the title under ${NOTE_TITLE_MAX} characters`;
  if (TITLE_FORBIDDEN.test(trimmed)) return "Titles can't contain [ ] | or #";
  const clash = tree.byTitle.get(normalizeTitle(trimmed));
  if (clash && clash.id !== noteId) return "Another note already has this title";
  return null;
}
