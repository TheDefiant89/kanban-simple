import type { Note } from "@/types";

/**
 * [[wikilinks]] and the notes tree they define.
 *
 * A link is `[[Title]]`, optionally with a heading (`[[Title#Heading]]`) and
 * shown text (`[[Title|shown text]]`). A link on the note's FIRST line names
 * its parent: the note is filed under that note in the tree, and becomes one
 * of its subtasks when the parent is converted into a task. Links further
 * down are ordinary cross-references, so a parent can mention its sub-notes
 * without being filed under them. Links inside code (fenced blocks or
 * `inline`) are ignored, as are links from a note to itself.
 */

export interface WikiLink {
  /** The linked note's title, as written (trimmed). */
  target: string;
  heading?: string;
  alias?: string;
}

/** Characters a note title can't contain, because they delimit a link. */
export const TITLE_FORBIDDEN = /[[\]|#\r\n]/;

const LINK_RE = /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]*))?(?:\|([^[\]\n]*))?\]\]/g;

// Fenced blocks (closed, or running to the end of the note) and inline code.
const CODE_RE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** Splits markdown into alternating [text, code, text, code, ...] runs. */
function splitCode(content: string): string[] {
  return content.split(CODE_RE);
}

export function parseLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  splitCode(content).forEach((part, i) => {
    if (i % 2 === 1) return;
    for (const match of part.matchAll(LINK_RE)) {
      const target = match[1].trim();
      if (!target) continue;
      links.push({
        target,
        heading: match[2]?.trim() || undefined,
        alias: match[3]?.trim() || undefined,
      });
    }
  });
  return links;
}

/**
 * The title linked from the note's first non-blank line (its parent), or
 * null. Links to the note itself don't count.
 */
export function parentTitleOf(note: Pick<Note, "title" | "content">): string | null {
  const firstLine = note.content.split("\n").find((line) => line.trim() !== "") ?? "";
  const own = normalizeTitle(note.title);
  const link = parseLinks(firstLine).find((l) => normalizeTitle(l.target) !== own);
  return link?.target ?? null;
}

/** Hash href used for wikilinks when rendering markdown. */
export const NOTE_HREF_PREFIX = "#note/";

/**
 * Rewrites [[links]] (outside code) into ordinary markdown links with a
 * `#note/<title>` href, so a markdown renderer can show them and a custom
 * link component can open the note.
 */
export function wikilinksToMarkdown(content: string): string {
  return splitCode(content)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(LINK_RE, (_m, target: string, heading?: string, alias?: string) => {
            const title = target.trim();
            const text =
              alias?.trim() || (heading?.trim() ? `${title} › ${heading.trim()}` : title);
            return `[${text}](<${NOTE_HREF_PREFIX}${encodeURIComponent(title)}>)`;
          })
    )
    .join("");
}

export function titleFromHref(href: string | undefined): string | null {
  if (!href?.startsWith(NOTE_HREF_PREFIX)) return null;
  try {
    return decodeURIComponent(href.slice(NOTE_HREF_PREFIX.length));
  } catch {
    return null;
  }
}

export interface NoteTreeNode {
  /** Note id, or `ghost:<title>` for a parent that's linked but doesn't exist. */
  key: string;
  title: string;
  note: Note | null;
  children: NoteTreeNode[];
}

export interface NoteTree {
  roots: NoteTreeNode[];
  /** Every real note's node, by note id. */
  byId: Map<string, NoteTreeNode>;
  /** Every real note, by normalized title. */
  byTitle: Map<string, Note>;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortNodes(nodes: NoteTreeNode[]) {
  // Folders (notes with sub-notes) first, then alphabetical, like a file
  // browser.
  nodes.sort((a, b) => {
    const folders = Number(b.children.length > 0) - Number(a.children.length > 0);
    return folders || collator.compare(a.title, b.title);
  });
  for (const node of nodes) sortNodes(node.children);
}

export function buildNoteTree(notes: Note[]): NoteTree {
  const byTitle = new Map<string, Note>();
  for (const note of notes) byTitle.set(normalizeTitle(note.title), note);

  // parent[noteId] = parent key (a note id, or a ghost key).
  const parent = new Map<string, string>();
  const ghostTitles = new Map<string, string>();
  for (const note of notes) {
    const target = parentTitleOf(note);
    if (!target) continue;
    const key = normalizeTitle(target);
    const parentNote = byTitle.get(key);
    if (parentNote) {
      parent.set(note.id, parentNote.id);
    } else {
      const ghostKey = `ghost:${key}`;
      if (!ghostTitles.has(ghostKey)) ghostTitles.set(ghostKey, target);
      parent.set(note.id, ghostKey);
    }
  }

  // Break cycles (A links B, B links A): the alphabetically first note in
  // each cycle becomes a root, so every note still shows up exactly once.
  const titles = new Map(notes.map((n) => [n.id, n.title]));
  const titleOf = (id: string) => titles.get(id) ?? id;
  const sorted = [...notes].sort((a, b) => collator.compare(a.title, b.title));
  for (const note of sorted) {
    for (;;) {
      const path: string[] = [];
      const onPath = new Set<string>();
      let current: string | undefined = note.id;
      while (current && !onPath.has(current)) {
        onPath.add(current);
        path.push(current);
        current = parent.get(current);
      }
      if (!current) break;
      const cycle = path.slice(path.indexOf(current));
      const cut = cycle.reduce((a, b) => (collator.compare(titleOf(a), titleOf(b)) <= 0 ? a : b));
      parent.delete(cut);
    }
  }

  const byId = new Map<string, NoteTreeNode>();
  for (const note of notes) {
    byId.set(note.id, { key: note.id, title: note.title, note, children: [] });
  }
  const ghosts = new Map<string, NoteTreeNode>();
  for (const [key, title] of ghostTitles) ghosts.set(key, { key, title, note: null, children: [] });

  const roots: NoteTreeNode[] = [];
  for (const note of notes) {
    const node = byId.get(note.id)!;
    const parentKey = parent.get(note.id);
    const parentNode = parentKey ? (byId.get(parentKey) ?? ghosts.get(parentKey)) : undefined;
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }
  for (const ghost of ghosts.values()) if (ghost.children.length > 0) roots.push(ghost);

  sortNodes(roots);
  return { roots, byId, byTitle };
}

/** A note's sub-notes in tree order: direct children only, or all descendants. */
export function subNotesOf(node: NoteTreeNode, nested: boolean): Note[] {
  const result: Note[] = [];
  const visit = (children: NoteTreeNode[]) => {
    for (const child of children) {
      if (child.note) result.push(child.note);
      if (nested) visit(child.children);
    }
  };
  visit(node.children);
  return result;
}

/** Keys of `key`'s ancestors, nearest first. */
export function ancestorKeys(tree: NoteTree, key: string): string[] {
  const parentOf = new Map<string, string>();
  const walk = (nodes: NoteTreeNode[], parentKey?: string) => {
    for (const node of nodes) {
      if (parentKey) parentOf.set(node.key, parentKey);
      walk(node.children, node.key);
    }
  };
  walk(tree.roots);
  const result: string[] = [];
  for (let k = parentOf.get(key); k; k = parentOf.get(k)) result.push(k);
  return result;
}

/**
 * The tree pruned to nodes whose title or content matches `query`, plus the
 * ancestors that lead to them.
 */
export function filterTree(roots: NoteTreeNode[], query: string): NoteTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return roots;
  const matches = (node: NoteTreeNode) =>
    node.title.toLowerCase().includes(q) || !!node.note?.content.toLowerCase().includes(q);
  const prune = (nodes: NoteTreeNode[]): NoteTreeNode[] =>
    nodes.flatMap((node) => {
      const children = prune(node.children);
      return matches(node) || children.length > 0 ? [{ ...node, children }] : [];
    });
  return prune(roots);
}

/**
 * When the text before the caret is an unfinished `[[query`, returns the
 * query and where it starts, for link autocompletion.
 */
export function openLinkQuery(
  text: string,
  caret: number
): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  const query = before.slice(open + 2);
  if (/[[\]|#\n]/.test(query) || query.length > 200) return null;
  return { query, start: open + 2 };
}
