import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  FilePlus2,
  FileText,
  ListChecks,
  Loader2,
  MoreHorizontal,
  PenLine,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Markdown } from "@/features/notes/markdown";
import { ancestorKeys, openLinkQuery, type NoteTree } from "@/features/notes/wikilinks";
import { NOTE_CONTENT_MAX, NOTE_TITLE_MAX, titleProblem } from "@/features/notes/note-utils";
import { useNoteMutations } from "@/features/notes/use-notes";
import { useNotesStore } from "@/store/notes-store";
import type { NoteTask } from "@/services/notes";
import type { Note } from "@/types";

interface NoteEditorProps {
  note: Note;
  tree: NoteTree;
  tasks: NoteTask[];
  onBack: () => void;
  onClose: () => void;
  /** Opens the note with this title, creating it if it doesn't exist. */
  onOpenTitle: (title: string) => void;
  onCreateChild: (parentTitle: string) => void;
  onConvert: (note: Note) => void;
  onDelete: (note: Note) => void;
  onOpenTask: (task: NoteTask) => void;
}

export function NoteEditor({
  note,
  tree,
  tasks,
  onBack,
  onClose,
  onOpenTitle,
  onCreateChild,
  onConvert,
  onDelete,
  onOpenTask,
}: NoteEditorProps) {
  const draft = useNotesStore((s) => s.drafts[note.id]);
  const setDraft = useNotesStore((s) => s.setDraft);
  const clearDraft = useNotesStore((s) => s.clearDraft);
  const openNote = useNotesStore((s) => s.openNote);
  const { update } = useNoteMutations();

  const title = draft?.title ?? note.title;
  const content = draft?.content ?? note.content;
  const dirty = !!draft;

  // New and empty notes open for writing; others open rendered.
  const [mode, setMode] = useState<"write" | "preview">(() =>
    note.content.trim() && !draft ? "preview" : "write"
  );
  const [showErrors, setShowErrors] = useState(false);
  useEffect(() => {
    setMode(note.content.trim() && !useNotesStore.getState().drafts[note.id] ? "preview" : "write");
    setShowErrors(false);
    // Only when a different note is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const titleRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Focus the title of a brand-new (still "Untitled…") note.
  useEffect(() => {
    if (
      /^Untitled( \d+)?$/.test(note.title) &&
      !note.content.replace(/\[\[[^\]]*\]\]/, "").trim()
    ) {
      titleRef.current?.select();
    }
  }, [note.id, note.title, note.content]);

  const edit = (next: { title?: string; content?: string }) => {
    const value = { title, content, ...next };
    if (value.title === note.title && value.content === note.content) clearDraft(note.id);
    else setDraft(note.id, value);
  };

  const problem = titleProblem(title, tree, note.id);
  const tooLong = content.length > NOTE_CONTENT_MAX;

  const save = async () => {
    if (!dirty || update.isPending) return;
    if (problem || tooLong) {
      setShowErrors(true);
      return;
    }
    const updates: Partial<Pick<Note, "title" | "content">> = {};
    if (title.trim() !== note.title) updates.title = title.trim();
    if (content !== note.content) updates.content = content;
    if (Object.keys(updates).length === 0) {
      clearDraft(note.id);
      return;
    }
    try {
      await update.mutateAsync({ note, updates });
      clearDraft(note.id);
      setShowErrors(false);
    } catch {
      // Toasted by the mutation; the draft stays.
    }
  };

  const onEditorKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
    }
  };

  // --- [[link]] autocompletion ---------------------------------------------
  const [linkQuery, setLinkQuery] = useState<{ query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const suggestions = useMemo(() => {
    if (!linkQuery) return [];
    const q = linkQuery.query.trim().toLowerCase();
    const own = note.id;
    const all = [...tree.byTitle.values()].filter((n) => n.id !== own);
    const starts = all.filter((n) => n.title.toLowerCase().startsWith(q));
    const contains = all.filter(
      (n) => !n.title.toLowerCase().startsWith(q) && n.title.toLowerCase().includes(q)
    );
    return [...starts, ...contains].slice(0, 8);
  }, [linkQuery, tree, note.id]);

  const refreshLinkQuery = () => {
    const el = textareaRef.current;
    if (!el || el.selectionStart !== el.selectionEnd) return setLinkQuery(null);
    const next = openLinkQuery(el.value, el.selectionStart);
    setLinkQuery(next);
    setHighlight(0);
  };

  const insertLink = (linkTitle: string) => {
    const el = textareaRef.current;
    if (!el || !linkQuery) return;
    const caret = el.selectionStart;
    const after = content.slice(caret);
    const closing = after.startsWith("]]") ? "" : "]]";
    const next = content.slice(0, linkQuery.start) + linkTitle + closing + after;
    edit({ content: next });
    setLinkQuery(null);
    const pos = linkQuery.start + linkTitle.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (linkQuery && suggestions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setHighlight((h) => (h + delta + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertLink(suggestions[highlight].title);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setLinkQuery(null);
        return;
      }
    }
  };

  // --- Context: breadcrumb, sub-notes, tasks --------------------------------
  const node = tree.byId.get(note.id);
  const breadcrumb = useMemo(() => {
    const keys = ancestorKeys(tree, note.id).reverse();
    return keys.map((key) => {
      const ancestor = tree.byId.get(key);
      return {
        key,
        title: ancestor?.title ?? key.replace(/^ghost:/, ""),
        id: ancestor?.note?.id,
      };
    });
  }, [tree, note.id]);
  const subNotes = node?.children ?? [];
  const existingTitles = useMemo(() => new Set(tree.byTitle.keys()), [tree]);

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={`Note: ${note.title}`}
      onKeyDown={onEditorKeyDown}
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 xl:hidden"
          onClick={onBack}
          aria-label="Back to notes"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <nav
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-xs text-muted-foreground"
          aria-label="Note location"
        >
          {breadcrumb.map((crumb) => (
            <span key={crumb.key} className="flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                className="max-w-28 truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
                onClick={() => (crumb.id ? openNote(crumb.id) : onOpenTitle(crumb.title))}
              >
                {crumb.title}
              </button>
              <ChevronRight className="h-3 w-3 shrink-0" />
            </span>
          ))}
          <span className="truncate px-1 font-medium text-foreground">{note.title}</span>
        </nav>

        <div className="flex shrink-0 items-center rounded-[9px] border bg-panel-2 p-0.5">
          <button
            type="button"
            onClick={() => setMode("write")}
            className={cn(
              "flex h-7 items-center gap-1 rounded-[7px] px-2 text-xs font-medium",
              mode === "write" ? "bg-accent-grad text-white" : "text-muted-foreground"
            )}
            aria-pressed={mode === "write"}
          >
            <PenLine className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Write</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("preview");
              setLinkQuery(null);
            }}
            className={cn(
              "flex h-7 items-center gap-1 rounded-[7px] px-2 text-xs font-medium",
              mode === "preview" ? "bg-accent-grad text-white" : "text-muted-foreground"
            )}
            aria-pressed={mode === "preview"}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Note actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCreateChild(note.title)}>
              <FilePlus2 className="h-4 w-4" /> New sub-note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onConvert(note)}>
              <ListChecks className="h-4 w-4" />
              {tasks.length > 0 ? "Update task" : "Convert to task"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(note)}>
              <Trash2 className="h-4 w-4" /> Delete note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
          aria-label="Close note"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
        <div className="px-4 pt-4 sm:px-5">
          <input
            ref={titleRef}
            value={title}
            maxLength={NOTE_TITLE_MAX + 20}
            onChange={(e) => edit({ title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setMode("write");
                requestAnimationFrame(() => textareaRef.current?.focus());
              }
            }}
            placeholder="Untitled"
            aria-label="Note title"
            aria-invalid={showErrors && !!problem}
            className="font-display w-full bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground"
          />
          {(showErrors || (problem && title !== note.title)) && problem && (
            <p className="mt-1 text-xs text-destructive">{problem}</p>
          )}
        </div>

        <div className="relative flex min-h-[260px] flex-1 flex-col px-4 py-3 sm:px-5">
          {mode === "write" ? (
            <>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => {
                  edit({ content: e.target.value });
                  requestAnimationFrame(refreshLinkQuery);
                }}
                onKeyDown={onTextareaKeyDown}
                onKeyUp={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") refreshLinkQuery();
                }}
                onClick={refreshLinkQuery}
                onBlur={() => setTimeout(() => setLinkQuery(null), 150)}
                placeholder={
                  "Write in markdown…\n\nPut [[Parent note]] on the first line to file this note under another one."
                }
                aria-label="Note content (markdown)"
                spellCheck
                className="min-h-[240px] w-full flex-1 resize-none bg-transparent font-mono text-[13.5px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
              />
              {linkQuery && suggestions.length > 0 && (
                <ul
                  role="listbox"
                  aria-label="Link to note"
                  className="absolute inset-x-4 bottom-2 z-10 max-h-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg scrollbar-thin sm:inset-x-5"
                >
                  {suggestions.map((s, i) => (
                    <li key={s.id} role="option" aria-selected={i === highlight}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertLink(s.title)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                          i === highlight && "bg-accent"
                        )}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : content.trim() ? (
            <Markdown content={content} onOpenLink={onOpenTitle} existingTitles={existingTitles} />
          ) : (
            <button
              type="button"
              onClick={() => setMode("write")}
              className="text-left text-sm text-muted-foreground"
            >
              Nothing here yet — click to start writing.
            </button>
          )}
          {tooLong && (
            <p className="mt-1 text-xs text-destructive">
              Notes are limited to {NOTE_CONTENT_MAX.toLocaleString()} characters.
            </p>
          )}
        </div>

        {(tasks.length > 0 || subNotes.length > 0) && (
          <div className="flex flex-col gap-4 border-t px-4 py-4 sm:px-5">
            {tasks.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Linked task
                </p>
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span
                      className="neon-sm h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: task.project?.color,
                        ["--glow-c" as string]: task.project?.color,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          task.completed_at && "text-muted-foreground line-through"
                        )}
                      >
                        {task.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {task.project?.name}
                        {task.subtask_count > 0 &&
                          ` · ${task.subtask_done}/${task.subtask_count} subtasks`}
                      </span>
                    </span>
                    {task.subtask_count > 0 && (
                      <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(task.subtask_done / task.subtask_count) * 100}%` }}
                        />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {subNotes.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Sub-notes
                </p>
                {subNotes.map((child) => (
                  <button
                    key={child.key}
                    type="button"
                    onClick={() => child.note && openNote(child.note.id)}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-accent"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{child.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:pb-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Unsaved changes
            </span>
          ) : (
            "All changes saved"
          )}
        </span>
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => clearDraft(note.id)}>
            Discard
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={!dirty || update.isPending}
          title="Save (Ctrl+S)"
        >
          {update.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </footer>
    </section>
  );
}
