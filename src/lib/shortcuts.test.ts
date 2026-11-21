import { describe, expect, it } from "vitest";
import { getShortcutAction, SKIP_SELECTOR } from "./shortcuts";

// Stand-ins for DOM targets: `inside` says whether closest(SKIP_SELECTOR)
// finds a field, menu or dialog around the element.
const target = (inside: boolean) =>
  ({
    closest: (selector: string) => (selector === SKIP_SELECTOR && inside ? {} : null),
  }) as unknown as EventTarget;

const press = (key: string, extra: Partial<Parameters<typeof getShortcutAction>[0]> = {}) =>
  getShortcutAction({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: target(false),
    ...extra,
  });

describe("getShortcutAction", () => {
  it("maps the board keys, case-insensitively", () => {
    expect(press("n")).toBe("new-task");
    expect(press("N")).toBe("new-task");
    expect(press("/")).toBe("search");
    expect(press("c")).toBe("toggle-completed");
    expect(press("?")).toBe("help");
  });

  it("ignores unmapped keys", () => {
    expect(press("x")).toBeNull();
    expect(press("Enter")).toBeNull();
    expect(press("Escape")).toBeNull();
  });

  it("ignores modifier combos, repeats, composition and handled events", () => {
    expect(press("n", { ctrlKey: true })).toBeNull();
    expect(press("c", { metaKey: true })).toBeNull();
    expect(press("n", { altKey: true })).toBeNull();
    expect(press("n", { repeat: true })).toBeNull();
    expect(press("n", { isComposing: true })).toBeNull();
    expect(press("n", { defaultPrevented: true })).toBeNull();
  });

  it("ignores keys typed into fields, menus and dialogs", () => {
    expect(press("n", { target: target(true) })).toBeNull();
    expect(press("/", { target: target(true) })).toBeNull();
  });

  it("handles targets without closest (window, document)", () => {
    expect(press("n", { target: null })).toBe("new-task");
    expect(press("n", { target: {} as EventTarget })).toBe("new-task");
  });

  it("skips the places where a plain key means something else", () => {
    for (const part of [
      "input",
      "textarea",
      "select",
      "[contenteditable]",
      "[role='menu']",
      "[role='listbox']",
      "[role='dialog']",
      "[role='alertdialog']",
    ]) {
      expect(SKIP_SELECTOR).toContain(part);
    }
  });
});
