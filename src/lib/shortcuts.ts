export type ShortcutAction = "new-task" | "search" | "toggle-completed" | "help";

export interface ShortcutInfo {
  keys: string[];
  description: string;
}

/** Shown in the shortcuts help dialog, in display order. */
export const BOARD_SHORTCUTS: ShortcutInfo[] = [
  { keys: ["N"], description: "Add a task to the first column" },
  { keys: ["/"], description: "Search tasks" },
  { keys: ["C"], description: "Show or hide completed tasks" },
  { keys: ["Esc"], description: "Close the add-task box or a dialog" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
];

const KEY_ACTIONS: Record<string, ShortcutAction> = {
  n: "new-task",
  "/": "search",
  c: "toggle-completed",
  "?": "help",
};

// Places where a plain keypress means something else: typing, menus and
// listboxes (typeahead), and dialogs.
export const SKIP_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='menu']",
  "[role='listbox']",
  "[role='dialog']",
  "[role='alertdialog']",
].join(",");

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat" | "isComposing" | "defaultPrevented"
> & { target: EventTarget | null };

/**
 * Map a keydown to a board shortcut, or null when it should be left alone:
 * modifier combos (browser and OS shortcuts), held-down repeats, IME
 * composition, and keys typed into fields, menus or dialogs. Shift is
 * allowed because "?" needs it on most layouts.
 */
export function getShortcutAction(event: KeyEventLike): ShortcutAction | null {
  if (event.defaultPrevented || event.repeat || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target as Partial<Pick<Element, "closest">> | null;
  if (typeof target?.closest === "function" && target.closest(SKIP_SELECTOR)) return null;
  return KEY_ACTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key] ?? null;
}
