import { lazy, Suspense, useMemo } from "react";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotes } from "@/features/notes/use-notes";
import { normalizeTitle } from "@/features/notes/wikilinks";

// The markdown renderer stays out of the board's bundle until a linked
// task is opened.
const Markdown = lazy(() => import("@/features/notes/markdown"));

interface LinkedNoteProps {
  noteId: string;
  /** Opens a note (by id) in the notes panel. */
  onOpenNote: (noteId: string) => void;
}

/** A task's source note, rendered inline in the task dialog. */
export function LinkedNote({ noteId, onOpenNote }: LinkedNoteProps) {
  const { tree, isLoading } = useNotes();
  const note = tree.byId.get(noteId)?.note;
  const existingTitles = useMemo(() => new Set(tree.byTitle.keys()), [tree]);

  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;
  if (!note) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5">
          <NotebookPen className="h-3.5 w-3.5 text-[var(--accent-solid)]" /> Linked note
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onOpenNote(note.id)}>
          Open note
        </Button>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border bg-panel p-3 scrollbar-thin">
        <p className="font-display mb-1.5 text-sm font-semibold">{note.title}</p>
        {note.content.trim() ? (
          <Suspense fallback={<Skeleton className="h-10" />}>
            <Markdown
              content={note.content}
              existingTitles={existingTitles}
              onOpenLink={(title) => {
                const target = tree.byTitle.get(normalizeTitle(title));
                if (target) onOpenNote(target.id);
              }}
            />
          </Suspense>
        ) : (
          <p className="text-xs text-muted-foreground">This note is empty.</p>
        )}
      </div>
    </div>
  );
}
