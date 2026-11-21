// Droppable ids shared by the board (which resolves drops) and its columns
// (which register them). Each column's task list is its own droppable so a
// task can be dropped into an empty column; its id is prefixed so it can't
// collide with the column's own sortable id.

const DROPZONE_PREFIX = "dropzone::";

/** Droppable id of a column's task list. */
export const dropzoneId = (columnId: string) => `${DROPZONE_PREFIX}${columnId}`;

/** The column id behind a task-list droppable id, or null for any other id. */
export function columnIdFromDropzone(id: string): string | null {
  return id.startsWith(DROPZONE_PREFIX) ? id.slice(DROPZONE_PREFIX.length) : null;
}
