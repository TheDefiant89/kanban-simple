/**
 * Captures the screenshots used by the in-app Help page (src/pages/Help.tsx).
 *
 * 1. Start the app against in-memory demo data (no Supabase needed):
 *      npx vite --config scripts/help/vite.config.ts
 * 2. In another terminal:
 *      node scripts/help/capture.cjs
 *
 * Needs Playwright with Chromium (`npm i -D playwright && npx playwright
 * install chromium` if it isn't already available). Images are written as
 * WebP to public/help/.
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const BASE = process.env.HELP_BASE_URL ?? "http://localhost:5199/kanban-simple";
const OUT = path.resolve(__dirname, "../../public/help");
const SIZES = path.resolve(__dirname, "../../src/pages/help-shots.json");
const ONLY = process.argv.slice(2);

fs.mkdirSync(OUT, { recursive: true });

/** Saves a screenshot of `target` (page or locator) as WebP. */
async function shot(page, name, target = page, options = {}) {
  if (ONLY.length && !ONLY.includes(name)) return;
  await page.waitForTimeout(450); // let animations settle
  const png = await target.screenshot({ animations: "disabled", ...options });
  const webp = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return {
      data: canvas.toDataURL("image/webp", 0.82).split(",")[1],
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }, png.toString("base64"));
  fs.writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(webp.data, "base64"));
  // Image sizes let the Help page reserve space before lazy images load,
  // so links to a section land in the right place.
  const sizes = fs.existsSync(SIZES) ? JSON.parse(fs.readFileSync(SIZES, "utf8")) : {};
  sizes[name] = [webp.width / 2, webp.height / 2];
  const sorted = Object.fromEntries(
    Object.keys(sizes)
      .sort()
      .map((k) => [k, sizes[k]])
  );
  fs.writeFileSync(SIZES, JSON.stringify(sorted, null, 2) + "\n");
  console.log("saved", name);
}

async function newPage(
  browser,
  { width = 1440, height = 900, theme = "dark", mobile = false } = {}
) {
  const context = await browser.newContext(
    mobile
      ? {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        }
      : { viewport: { width, height }, deviceScaleFactor: 2 }
  );
  await context.addInitScript((t) => {
    localStorage.setItem("kanban-theme", JSON.stringify({ state: { theme: t }, version: 0 }));
  }, theme);
  return context.newPage();
}

async function go(page, route) {
  await page.goto(`${BASE}${route}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
}

const escape = (page) => page.keyboard.press("Escape").then(() => page.waitForTimeout(300));

(async () => {
  const browser = await chromium.launch();

  // ---------- signed out ----------
  {
    const page = await newPage(browser, { width: 960, height: 640 });
    await go(page, "/login");
    await shot(page, "sign-in");
    await page.close();
  }

  // ---------- dashboard ----------
  {
    const page = await newPage(browser, { height: 640 });
    await go(page, "/dashboard");
    await shot(page, "dashboard");

    await page.getByRole("button", { name: "Project actions" }).first().click();
    await shot(page, "project-menu", page, { clip: { x: 0, y: 160, width: 720, height: 360 } });
    await escape(page);

    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByRole("dialog").getByRole("textbox").first().fill("Garden Makeover");
    await shot(page, "project-new", page.getByRole("dialog"));
    await escape(page);
    await page.close();
  }

  // ---------- board ----------
  {
    const page = await newPage(browser);
    await go(page, "/board/website-relaunch");
    await shot(page, "board");

    // Column sort + actions
    const todo = page.locator("div.snap-start").filter({ hasText: "Pricing page layout" }).first();
    await todo.getByRole("button", { name: "Sort tasks (Custom order)", exact: true }).click();
    await shot(page, "column-sort", page, { clip: { x: 300, y: 180, width: 560, height: 360 } });
    await escape(page);
    await todo.getByRole("button", { name: "Column actions", exact: true }).click();
    await shot(page, "column-actions", page, { clip: { x: 300, y: 180, width: 560, height: 300 } });
    await escape(page);

    // Collapsed column
    const backlog = page
      .locator("div.snap-start")
      .filter({ hasText: "Write blog launch post" })
      .first();
    await backlog.getByRole("button", { name: "Collapse column", exact: true }).click();
    await page.waitForTimeout(400);
    await shot(page, "column-collapsed", page, { clip: { x: 0, y: 176, width: 760, height: 420 } });
    await page.getByRole("button", { name: "Expand column", exact: true }).click();
    await page.waitForTimeout(400);

    // Quick add
    await page.setViewportSize({ width: 1440, height: 600 });
    const inProgress = page
      .locator("div.snap-start")
      .filter({ hasText: "Contact form API" })
      .first();
    await inProgress.getByRole("button", { name: "Add task", exact: true }).click();
    await page.keyboard.type("Footer social icons");
    const box = await page.getByPlaceholder("Enter a title…").boundingBox();
    const col = await inProgress.boundingBox();
    await shot(page, "quick-add", page, {
      clip: { x: col.x - 8, y: col.y - 8, width: col.width + 16, height: box.y - col.y + 110 },
    });
    await escape(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Task details
    await page.getByText("Homepage hero section").click();
    await page.waitForTimeout(500);
    await shot(page, "task-dialog", page.getByRole("dialog"));
    // Recurrence options
    await escape(page);

    // Filters
    await page.getByRole("button", { name: "Priority" }).click();
    await page.getByRole("menuitemcheckbox", { name: "High" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Critical" }).click();
    await shot(page, "filters", page, { clip: { x: 0, y: 116, width: 960, height: 400 } });
    await escape(page);
    await page.getByRole("button", { name: "Priority" }).click();
    await page.getByRole("menuitemcheckbox", { name: "High" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Critical" }).click();
    await escape(page);

    await page.getByRole("combobox").first().click();
    await shot(page, "due-filter", page, { clip: { x: 0, y: 116, width: 760, height: 420 } });
    await escape(page);

    // Show completed
    await page.getByLabel("Show completed").click();
    await page.waitForTimeout(400);
    await page.locator("main").evaluate((el) => {
      const board = el.querySelector(".overflow-x-auto");
      if (board) board.scrollLeft = board.scrollWidth;
    });
    await page.waitForTimeout(300);
    await shot(page, "show-completed");
    await page.getByLabel("Show completed").click();

    // Archived
    await page.getByRole("button", { name: "Archived" }).click();
    await page.waitForTimeout(600);
    await shot(page, "archived", page.getByRole("dialog"));
    await escape(page);

    // Shortcuts
    await page.evaluate(
      () => document.activeElement instanceof HTMLElement && document.activeElement.blur()
    );
    await page.keyboard.press("?");
    await shot(page, "shortcuts", page.getByRole("dialog"));
    await escape(page);

    // Theme menu
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await shot(page, "theme-menu", page, { clip: { x: 1000, y: 0, width: 440, height: 200 } });
    await escape(page);
    await page.close();
  }

  // ---------- task dialog: recurrence + tags ----------
  {
    const page = await newPage(browser);
    await go(page, "/board/website-relaunch");
    await page.getByText("Weekly analytics review").click();
    await page.waitForTimeout(500);
    await shot(page, "task-recurring", page.getByRole("dialog"));
    await escape(page);
    await page.close();
  }

  // ---------- light theme ----------
  {
    const page = await newPage(browser, { theme: "light" });
    await go(page, "/board/website-relaunch");
    await shot(page, "board-light");
    await page.close();
  }

  // ---------- notes ----------
  {
    const page = await newPage(browser);
    await go(page, "/board/website-relaunch");
    await page.getByRole("button", { name: "Open notes" }).click();
    await page.waitForTimeout(600);
    for (const name of ["Launch checklist", "Meeting notes"]) {
      const toggle = page.getByRole("button", { name: `Expand ${name}` });
      if (await toggle.count()) await toggle.first().click();
    }
    await shot(page, "notes-tree", page, { clip: { x: 800, y: 0, width: 640, height: 440 } });

    await page
      .getByRole("treeitem")
      .filter({ hasText: "Launch checklist" })
      .first()
      .getByText("Launch checklist", { exact: true })
      .first()
      .click();
    await page.waitForTimeout(700);
    await shot(page, "notes-preview");

    await page.getByRole("button", { name: "Write", exact: true }).click();
    await page.waitForTimeout(300);
    const editor = await page.locator('[aria-label^="Note: "]').boundingBox();
    await shot(page, "notes-editor", page, {
      clip: { x: editor.x, y: 58, width: 1440 - editor.x, height: 560 },
    });

    // A note that isn't a task yet: its menu offers "Convert to task".
    await page
      .getByRole("treeitem")
      .filter({ hasText: "Meeting notes" })
      .first()
      .getByText("Meeting notes", { exact: true })
      .first()
      .click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Note actions" }).click();
    await shot(page, "notes-menu", page, { clip: { x: 540, y: 58, width: 900, height: 380 } });
    await page.getByRole("menuitem", { name: "Convert to task" }).click();
    await page.waitForTimeout(600);
    await shot(page, "notes-convert", page.getByRole("dialog"));
    await escape(page);
    await page.close();
  }

  // ---------- task linked to a note ----------
  {
    const page = await newPage(browser);
    await go(page, "/board/website-relaunch");
    await page.getByText("Launch checklist").first().click();
    await page.waitForTimeout(800);
    await shot(page, "task-linked-note", page.getByRole("dialog"));
    await escape(page);
    await page.close();
  }

  // ---------- settings ----------
  {
    const page = await newPage(browser, { height: 1000 });
    await go(page, "/settings");
    await shot(page, "settings", page, { clip: { x: 340, y: 58, width: 760, height: 942 } });
    const tags = page
      .locator("div.rounded-xl.border")
      .filter({ hasText: "Create, rename, recolor" });
    await shot(page, "settings-tags", tags);
    await page.close();
  }

  // ---------- phone ----------
  {
    const page = await newPage(browser, { mobile: true });
    await go(page, "/board/website-relaunch");
    await shot(page, "mobile-board");
    await go(page, "/dashboard");
    await shot(page, "mobile-dashboard");
    await page.close();
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
