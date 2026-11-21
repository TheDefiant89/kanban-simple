import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { joinLines, parseQuickAddInput, QUICK_ADD_MAX_LINES } from "@/features/board/quick-add";
import { cn } from "@/lib/utils";

interface QuickAddComposerProps {
  columnName: string;
  /** Create one task per title, in order. */
  onAdd: (titles: string[]) => void;
  /** Close the composer (Escape, the X button, or blurring it while empty). */
  onClose: () => void;
  /** Open the full task dialog with the typed title. */
  onAddWithDetails: (title: string) => void;
}

const MAX_HEIGHT = 160;

/**
 * Trello-style inline "add a card" box at the bottom of a column. Enter
 * adds the task and keeps the box open for the next one.
 */
export function QuickAddComposer({
  columnName,
  onAdd,
  onClose,
  onAddWithDetails,
}: QuickAddComposerProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A multi-line paste waiting for "add N tasks" or "keep as one".
  const [pastedLines, setPastedLines] = useState<{ text: string; count: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const labelId = useId();
  const errorId = useId();

  useEffect(() => {
    textareaRef.current?.focus();
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  // Auto-grow up to MAX_HEIGHT, then scroll.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const submit = () => {
    const { titles, error: parseError } = parseQuickAddInput(value, 1);
    if (parseError) {
      setError(parseError);
      return;
    }
    if (titles.length === 0) {
      textareaRef.current?.focus();
      return;
    }
    onAdd(titles);
    setValue("");
    setError(null);
    textareaRef.current?.focus();
  };

  const addPasted = () => {
    if (!pastedLines) return;
    const { titles, error: parseError } = parseQuickAddInput(pastedLines.text);
    if (parseError) {
      setError(parseError);
      return;
    }
    onAdd(titles);
    setPastedLines(null);
    setError(null);
    textareaRef.current?.focus();
  };

  const keepPastedAsOne = () => {
    if (!pastedLines) return;
    const joined = [value, joinLines(pastedLines.text)].filter(Boolean).join(" ");
    setValue(joined);
    setPastedLines(null);
    setError(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Keep keys away from dnd-kit's keyboard sensor and other board handlers.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    // Enter submits. Not while an IME is composing (e.g. Japanese input),
    // where Enter confirms the composition instead.
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (pastedLines) addPasted();
      else submit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    const { titles } = parseQuickAddInput(text, Infinity);
    if (titles.length <= 1) return;
    e.preventDefault();
    setPastedLines({ text, count: titles.length });
    setError(null);
  };

  // Clicking away from an empty composer closes it; a typed draft keeps it
  // open so a stray tap doesn't lose it.
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
    if (!value.trim() && !pastedLines) onClose();
  };

  // Buttons don't take focus on press, so the textarea (and a phone's soft
  // keyboard) stays put between adds.
  const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

  const pasteCount = pastedLines ? Math.min(pastedLines.count, QUICK_ADD_MAX_LINES) : 0;

  return (
    <div
      ref={rootRef}
      className="animate-pop rounded-[11px] border bg-card p-2 shadow-sm"
      onBlur={handleBlur}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <label id={labelId} className="sr-only">
        New task title in {columnName}
      </label>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder="Enter a title…"
        aria-labelledby={labelId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        enterKeyHint="enter"
        className={cn(
          "block w-full resize-none bg-transparent px-1 py-1 text-base leading-snug outline-none placeholder:text-muted-foreground sm:text-sm",
          error && "text-destructive"
        )}
      />

      <p id={errorId} aria-live="polite" className="px-1 text-xs text-destructive empty:hidden">
        {error}
      </p>

      {pastedLines && (
        <div className="mt-1 rounded-md bg-panel-2 px-2 py-1.5 text-xs" role="status">
          <p>
            Pasted {pastedLines.count} lines.
            {pastedLines.count > QUICK_ADD_MAX_LINES &&
              ` Only the first ${QUICK_ADD_MAX_LINES} will be added.`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              className="h-9 sm:h-7"
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={addPasted}
            >
              Add {pasteCount} tasks
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 sm:h-7"
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={keepPastedAsOne}
            >
              Keep as one
            </Button>
          </div>
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1">
        <Button
          size="sm"
          className="h-11 px-4 sm:h-8 sm:px-3"
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={pastedLines ? addPasted : submit}
        >
          Add
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 sm:h-8 sm:w-8"
          onClick={onClose}
          aria-label="Cancel adding task"
        >
          <X className="h-4 w-4" />
        </Button>
        <Button
          variant="link"
          size="sm"
          className="ml-auto h-11 px-1 text-xs text-muted-foreground sm:h-8"
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={() => onAddWithDetails(pastedLines ? joinLines(pastedLines.text) : value.trim())}
        >
          Add with details…
        </Button>
      </div>
    </div>
  );
}
