import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, NotebookPen, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useNotesStore } from "@/store/notes-store";
import { useNoteMutations, useNoteTasks, useNotes } from "@/features/notes/use-notes";
import { NoteTree } from "@/features/notes/note-tree";
import { NoteEditor } from "@/features/notes/note-editor";
import { ConvertNoteDialog } from "@/features/notes/convert-note-dialog";
import { taskHref } from "@/features/notes/note-utils";
import {
  ancestorKeys,
  filterTree,
  normalizeTitle,
  TITLE_FORBIDDEN,
  type NoteTreeNode,
} from "@/features/notes/wikilinks";
import type { NoteTask } from "@/services/notes";
import type { Note } from "@/types";

const NO_TASKS: NoteTask[] = [];

const isPhone = () => window.matchMedia("(max-width: 767px)").matches;

/**
 * The notes side panel: a folder-style tree of notes on the right, and the
 * open note's editor beside it. From xl up both panes show side by side;
 * below that the editor replaces the tree (with a back button), and on
 * phones the whole panel is full-screen.
 */
export default function NotesPanel() {
  const navigate = useNavigate();
  const setOpen = useNotesStore((s) => s.setOpen);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const openNote = useNotesStore((s) => s.openNote);
  const closeNote = useNotesStore((s) => s.closeNote);
  const expanded = useNotesStore((s) => s.expanded);
  const toggleExpanded = useNotesStore((s) => s.toggleExpanded);
  const expand = useNotesStore((s) => s.expand);
  const drafts = useNotesStore((s) => s.drafts);
  const clearDraft = useNotesStore((s) => s.clearDraft);

  const { tree, notes, isLoading, isError, refetch } = useNotes();
  const { byNote } = useNoteTasks();
  const mutations = useNoteMutations();

  const [search, setSearch] = useState("");
  const [converting, setConverting] = useState<NoteTreeNode | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);

  const activeNote = activeNoteId ? (tree.byId.get(activeNoteId)?.note ?? null) : null;

  // A note opened from elsewhere (a task card, a link) is revealed in the tree.
  useEffect(() => {
    if (activeNoteId && tree.byId.has(activeNoteId)) expand(ancestorKeys(tree, activeNoteId));
  }, [activeNoteId, tree, expand]);

  // The open note was deleted (here or in another tab).
  useEffect(() => {
    if (!isLoading && !isError && activeNoteId && !tree.byId.has(activeNoteId)) closeNote();
  }, [isLoading, isError, activeNoteId, tree, closeNote]);

  const visibleRoots = useMemo(() => filterTree(tree.roots, search), [tree, search]);
  const draftIds = useMemo(() => new Set(Object.keys(drafts)), [drafts]);

  const uniqueTitle = useCallback(
    (base: string) => {
      if (!tree.byTitle.has(normalizeTitle(base))) return base;
      for (let i = 2; ; i += 1) {
        const candidate = `${base} ${i}`;
        if (!tree.byTitle.has(normalizeTitle(candidate))) return candidate;
      }
    },
    [tree]
  );

  const createAndOpen = useCallback(
    async (title: string, content = "") => {
      try {
        const note = await mutations.create.mutateAsync({ title, content });
        openNote(note.id);
        return note;
      } catch {
        return null;
      }
    },
    [mutations.create, openNote]
  );

  const handleNewNote = () => void createAndOpen(uniqueTitle("Untitled"));

  const handleCreateChild = useCallback(
    (parentTitle: string) => {
      const parent = tree.byTitle.get(normalizeTitle(parentTitle));
      if (parent) expand([parent.id]);
      else expand([`ghost:${normalizeTitle(parentTitle)}`]);
      void createAndOpen(uniqueTitle("Untitled"), `[[${parentTitle}]]\n\n`);
    },
    [tree, expand, createAndOpen, uniqueTitle]
  );

  const handleOpenTitle = useCallback(
    (title: string) => {
      const existing = tree.byTitle.get(normalizeTitle(title));
      if (existing) {
        openNote(existing.id);
        return;
      }
      const clean = title.trim();
      if (!clean || clean.length > 200 || TITLE_FORBIDDEN.test(clean)) {
        toast.error("That link can't be used as a note title");
        return;
      }
      void createAndOpen(clean).then((note) => note && toast.success(`Created "${note.title}"`));
    },
    [tree, openNote, createAndOpen]
  );

  const handleOpenNode = useCallback(
    (node: NoteTreeNode) => {
      if (node.note) {
        openNote(node.note.id);
        if (node.children.length > 0 && !expanded[node.key]) toggleExpanded(node.key);
      } else {
        handleOpenTitle(node.title);
      }
    },
    [openNote, expanded, toggleExpanded, handleOpenTitle]
  );

  const handleConvert = useCallback(
    (note: Note) => {
      const node = tree.byId.get(note.id);
      if (!node) return;
      if (drafts[note.id]) {
        toast.info("Save the note first, so the task gets its latest title and sub-notes");
        return;
      }
      setConverting(node);
    },
    [tree, drafts]
  );

  const handleOpenTask = useCallback(
    (task: NoteTask) => {
      if (!task.project) return;
      if (isPhone()) setOpen(false);
      navigate(taskHref(task.project.slug, task.id));
    },
    [navigate, setOpen]
  );

  const confirmDelete = async () => {
    if (!deleting) return;
    const note = deleting;
    setDeleting(null);
    try {
      await mutations.remove.mutateAsync(note.id);
      clearDraft(note.id);
      if (activeNoteId === note.id) closeNote();
      toast.success(`Deleted "${note.title}"`);
    } catch {
      // Toasted by the mutation.
    }
  };

  const deletingChildren = deleting ? (tree.byId.get(deleting.id)?.children.length ?? 0) : 0;
  const deletingTasks = deleting ? (byNote.get(deleting.id)?.length ?? 0) : 0;

  return (
    <aside
      aria-label="Notes"
      className={cn(
        "animate-slide-in-right flex min-h-0 bg-panel",
        // Phones: covers the page below the app header (which keeps the
        // notes toggle in reach). Larger: a column beside the page.
        "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:top-[calc(58px+env(safe-area-inset-top))] max-md:short:top-[calc(44px+env(safe-area-inset-top))]",
        "md:relative md:z-20 md:border-l md:shadow-[-12px_0_32px_-24px_oklch(0_0_0/0.5)]"
      )}
    >
      {activeNote && (
        <div className="flex min-h-0 w-full flex-col md:w-[480px] xl:w-[min(620px,42vw)] xl:border-r">
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            tree={tree}
            tasks={byNote.get(activeNote.id) ?? NO_TASKS}
            onBack={closeNote}
            onClose={closeNote}
            onOpenTitle={handleOpenTitle}
            onCreateChild={handleCreateChild}
            onConvert={handleConvert}
            onDelete={setDeleting}
            onOpenTask={handleOpenTask}
          />
        </div>
      )}

      <div className={cn("flex min-h-0 w-full flex-col md:w-80", activeNote && "max-xl:hidden")}>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <span className="bg-accent-grad neon-sm flex h-6 w-6 items-center justify-center rounded-[7px] text-white">
            <NotebookPen className="h-3.5 w-3.5" />
          </span>
          <h2 className="font-display flex-1 text-sm font-semibold">Notes</h2>
          <span className="rounded-full border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {notes.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleNewNote}
            disabled={mutations.create.isPending}
            aria-label="New note"
            title="New note"
          >
            <FilePlus2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen(false)}
            aria-label="Close notes"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="shrink-0 px-3 pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearch("")}
              placeholder="Search notes"
              aria-label="Search notes"
              className="h-9 w-full rounded-[9px] border bg-panel-2 pl-8 pr-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] scrollbar-thin">
          {isLoading ? (
            <div className="flex flex-col gap-1.5 p-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-lg" style={{ marginLeft: (i % 3) * 14 }} />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
              Couldn't load your notes.
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <span className="bg-accent-grad neon flex h-11 w-11 items-center justify-center rounded-xl text-white">
                <NotebookPen className="h-5 w-5" />
              </span>
              <p className="font-display text-sm font-semibold">No notes yet</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Notes support markdown. Put <code>[[Another note]]</code> on a note's first line to
                file it underneath — then turn the parent into a task, with each sub-note as a
                subtask.
              </p>
              <Button size="sm" onClick={handleNewNote}>
                <FilePlus2 className="h-3.5 w-3.5" /> New note
              </Button>
            </div>
          ) : visibleRoots.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No notes match.</p>
          ) : (
            <NoteTree
              nodes={visibleRoots}
              activeId={activeNoteId}
              expanded={expanded}
              forceExpanded={!!search.trim()}
              draftIds={draftIds}
              tasksByNote={byNote}
              onOpen={handleOpenNode}
              onToggle={toggleExpanded}
              onCreateChild={handleCreateChild}
              onConvert={handleConvert}
              onDelete={setDeleting}
            />
          )}
        </div>
      </div>

      <ConvertNoteDialog
        node={converting}
        tasks={converting?.note ? (byNote.get(converting.note.id) ?? NO_TASKS) : NO_TASKS}
        onOpenChange={(open) => !open && setConverting(null)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the note.
              {deletingChildren > 0 &&
                ` Its ${deletingChildren} sub-note${deletingChildren === 1 ? "" : "s"} stay, grouped under its name until you link them elsewhere.`}
              {deletingTasks > 0 && " Tasks made from it are kept, just no longer linked."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
