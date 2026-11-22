import { describe, expect, it } from "vitest";
import type { Note } from "@/types";
import {
  ancestorKeys,
  buildNoteTree,
  filterTree,
  openLinkQuery,
  parentTitleOf,
  parseLinks,
  subNotesOf,
  titleFromHref,
  wikilinksToMarkdown,
} from "./wikilinks";

let seq = 0;
function note(title: string, content = ""): Note {
  seq += 1;
  return {
    id: `n${seq}`,
    user_id: "u",
    title,
    content,
    created_at: "",
    updated_at: "",
  };
}

describe("parseLinks", () => {
  it("reads targets, headings and aliases", () => {
    expect(parseLinks("a [[One]] b [[ Two #Goals | the goals ]] [[Three|x]]")).toEqual([
      { target: "One", heading: undefined, alias: undefined },
      { target: "Two", heading: "Goals", alias: "the goals" },
      { target: "Three", heading: undefined, alias: "x" },
    ]);
  });

  it("ignores links inside code", () => {
    const content = "```\n[[Fenced]]\n```\n`[[Inline]]` [[Real]]";
    expect(parseLinks(content).map((l) => l.target)).toEqual(["Real"]);
  });

  it("ignores empty and malformed links", () => {
    expect(parseLinks("[[ ]] [[a\nb]] [[]]")).toEqual([]);
  });
});

describe("parentTitleOf", () => {
  it("is the first link on the first non-blank line, ignoring self-links", () => {
    expect(parentTitleOf({ title: "Me", content: "[[me]] then [[Parent]] [[Other]]" })).toBe(
      "Parent"
    );
    expect(parentTitleOf({ title: "Me", content: "\n  \nUnder [[Parent]]\n[[Other]]" })).toBe(
      "Parent"
    );
    expect(parentTitleOf({ title: "Me", content: "no links" })).toBeNull();
  });

  it("ignores links further down, so a parent can mention its sub-notes", () => {
    expect(parentTitleOf({ title: "Plan", content: "# Plan\n\nSee [[Step A]]" })).toBeNull();
  });
});

describe("wikilinksToMarkdown", () => {
  it("turns links into #note/ hrefs, leaving code alone", () => {
    const md = wikilinksToMarkdown("See [[My (draft) note|draft]] and `[[x]]`");
    expect(md).toBe("See [draft](<#note/My%20(draft)%20note>) and `[[x]]`");
    expect(titleFromHref("#note/My%20(draft)%20note")).toBe("My (draft) note");
    expect(titleFromHref("https://example.com")).toBeNull();
  });
});

describe("buildNoteTree", () => {
  it("files notes under the note their first link names", () => {
    const plan = note("Plan");
    const a = note("Step A", "[[plan]]");
    const b = note("Step B", "[[Plan]] see [[Step A]]\n\n[[Loose]]");
    const deep = note("Detail", "[[Step A]]");
    const loose = note("Loose");
    const tree = buildNoteTree([deep, b, loose, a, plan]);

    expect(tree.roots.map((n) => n.title)).toEqual(["Plan", "Loose"]);
    const planNode = tree.byId.get(plan.id)!;
    expect(planNode.children.map((n) => n.title)).toEqual(["Step A", "Step B"]);
    expect(subNotesOf(planNode, false).map((n) => n.title)).toEqual(["Step A", "Step B"]);
    expect(subNotesOf(planNode, true).map((n) => n.title)).toEqual(["Step A", "Detail", "Step B"]);
    expect(ancestorKeys(tree, deep.id)).toEqual([a.id, plan.id]);
  });

  it("groups notes linking to a missing note under a ghost parent", () => {
    const a = note("A", "[[Someday]]");
    const b = note("B", "[[someday]]");
    const tree = buildNoteTree([a, b]);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]).toMatchObject({ key: "ghost:someday", title: "Someday", note: null });
    expect(tree.roots[0].children.map((n) => n.title)).toEqual(["A", "B"]);
  });

  it("breaks link cycles so every note appears once", () => {
    const a = note("A", "[[B]]");
    const b = note("B", "[[C]]");
    const c = note("C", "[[A]]");
    const tree = buildNoteTree([a, b, c]);
    expect(tree.roots.map((n) => n.title)).toEqual(["A"]);
    const count = (nodes: typeof tree.roots): number =>
      nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
    expect(count(tree.roots)).toBe(3);
  });
});

describe("filterTree", () => {
  it("keeps matches and the folders leading to them", () => {
    const plan = note("Plan");
    const a = note("Buy milk", "[[Plan]]");
    const other = note("Other");
    const tree = buildNoteTree([plan, a, other]);
    const filtered = filterTree(tree.roots, "milk");
    expect(filtered.map((n) => n.title)).toEqual(["Plan"]);
    expect(filtered[0].children.map((n) => n.title)).toEqual(["Buy milk"]);
    expect(filterTree(tree.roots, "  ")).toBe(tree.roots);
  });
});

describe("openLinkQuery", () => {
  it("finds an unfinished [[ before the caret", () => {
    expect(openLinkQuery("see [[Pla", 9)).toEqual({ query: "Pla", start: 6 });
    expect(openLinkQuery("see [[Plan]] x", 14)).toBeNull();
    expect(openLinkQuery("no link", 7)).toBeNull();
  });
});
