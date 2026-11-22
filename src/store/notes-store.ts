import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface NoteDraft {
  title: string;
  content: string;
}

interface NotesState {
  /** Whether the notes side panel is showing. */
  open: boolean;
  /** The note open in the editor pane, if any. */
  activeNoteId: string | null;
  /** Folder keys (note ids or ghost keys) that are expanded in the tree. */
  expanded: Record<string, true>;
  /**
   * Unsaved edits by note id. Kept here rather than in the editor so
   * switching notes or closing the panel never loses typing; saved to
   * localStorage so a reload doesn't either.
   */
  drafts: Record<string, NoteDraft>;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  openNote: (noteId: string) => void;
  closeNote: () => void;
  toggleExpanded: (key: string) => void;
  expand: (keys: string[]) => void;
  setDraft: (noteId: string, draft: NoteDraft) => void;
  clearDraft: (noteId: string) => void;
  /** Forgets everything (on sign-out), so the next user starts clean. */
  reset: () => void;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      open: false,
      activeNoteId: null,
      expanded: {},
      drafts: {},
      setOpen: (open) => set({ open }),
      toggleOpen: () => set((s) => ({ open: !s.open })),
      openNote: (noteId) => set({ open: true, activeNoteId: noteId }),
      closeNote: () => set({ activeNoteId: null }),
      toggleExpanded: (key) =>
        set((s) => {
          const expanded = { ...s.expanded };
          if (expanded[key]) delete expanded[key];
          else expanded[key] = true;
          return { expanded };
        }),
      expand: (keys) =>
        set((s) =>
          keys.every((k) => s.expanded[k])
            ? s
            : { expanded: { ...s.expanded, ...Object.fromEntries(keys.map((k) => [k, true])) } }
        ),
      setDraft: (noteId, draft) => set((s) => ({ drafts: { ...s.drafts, [noteId]: draft } })),
      clearDraft: (noteId) =>
        set((s) => {
          if (!(noteId in s.drafts)) return s;
          const drafts = { ...s.drafts };
          delete drafts[noteId];
          return { drafts };
        }),
      reset: () => set({ open: false, activeNoteId: null, expanded: {}, drafts: {} }),
    }),
    {
      name: "kanban-notes",
      storage: createJSONStorage(() => localStorage),
      // The panel itself starts closed: on a phone it covers the page.
      partialize: (s) => ({ activeNoteId: s.activeNoteId, expanded: s.expanded, drafts: s.drafts }),
    }
  )
);
