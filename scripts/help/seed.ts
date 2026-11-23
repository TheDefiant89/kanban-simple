/* eslint-disable @typescript-eslint/no-explicit-any */
/** Demo data for the Help page screenshots. Dates are relative to today. */

type Row = Record<string, any>;
const USER_ID = "00000000-0000-4000-8000-000000000001";

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const ts = (offset: number) => `${day(offset)}T10:00:00.000Z`;

let counter = 0;
const id = (prefix: string) =>
  `${prefix.padEnd(8, "0").slice(0, 8)}-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

export function seed(): Record<string, Row[]> {
  counter = 0;
  const base = { user_id: USER_ID, created_at: ts(-30), updated_at: ts(-1) };

  const projects: Row[] = [
    ["Website Relaunch", "website-relaunch", "New marketing site, blog and docs", "#6366f1", -2],
    ["Mobile App", "mobile-app", "iOS and Android release 2.0", "#0ea5e9", -3],
    ["Home Renovation", "home-renovation", "Kitchen and bathroom refresh", "#f59e0b", -6],
    ["Q1 Marketing", "q1-marketing", "Campaigns, events and newsletter", "#ec4899", -9],
  ].map(([name, slug, description, color, updated]) => ({
    ...base,
    id: id("aaaa"),
    name,
    slug,
    description,
    color,
    is_archived: false,
    updated_at: ts(updated as number),
  }));

  const columnDefs = [
    ["Backlog", "#94a3b8"],
    ["Todo", "#3b82f6"],
    ["In Progress", "#f59e0b"],
    ["Review", "#a855f7"],
    ["Done", "#22c55e"],
  ];
  const columns: Row[] = projects.flatMap((p) =>
    columnDefs.map(([name, color], position) => ({
      ...base,
      id: id("cccc"),
      project_id: p.id,
      name,
      color,
      position,
      is_collapsed: false,
      sort_by: "custom",
    }))
  );
  const col = (projectIndex: number, name: string) =>
    columns.find((c) => c.project_id === projects[projectIndex].id && c.name === name)!.id;

  const tagDefs = [
    ["Design", "#ec4899"],
    ["Frontend", "#3b82f6"],
    ["Backend", "#14b8a6"],
    ["Bug", "#ef4444"],
    ["Content", "#f59e0b"],
    ["Research", "#a855f7"],
  ];
  const tags: Row[] = tagDefs.map(([name, color]) => ({ ...base, id: id("tttt"), name, color }));
  const tag = (name: string) => tags.find((t) => t.name === name)!.id;

  const notes: Row[] = [];
  const note = (title: string, content: string) => {
    const n = { ...base, id: id("nnnn"), title, content };
    notes.push(n);
    return n;
  };
  const launchNote = note(
    "Launch checklist",
    `Everything that has to be true before the new site goes live.

## Must have
- [x] Final copy for the home page
- [ ] Redirects from the old URLs
- [ ] Analytics and cookie banner

See [[SEO audit]] and [[Performance budget]] for the details.`
  );
  const seoNote = note(
    "SEO audit",
    `[[Launch checklist]]

Crawl the staging site and fix anything blocking indexing.

| Check | Status |
| --- | --- |
| Sitemap | Done |
| Canonical tags | In progress |
| Meta descriptions | Todo |`
  );
  const perfNote = note(
    "Performance budget",
    `[[Launch checklist]]

- LCP under **2.5 s** on 4G
- Total JS under 200 KB gzipped
- Images served as AVIF / WebP`
  );
  note("Meeting notes", `Running log of team meetings. Each meeting is a sub-note.`);
  note(
    "Standup – Monday",
    `[[Meeting notes]]

- Hero illustration is with the designer
- Blocked on API keys for the newsletter form
- Next: review the pricing page`
  );
  note(
    "Reading list",
    `- *Refactoring UI* — Wathan & Schoger
- *Don't Make Me Think* — Steve Krug
- \`[[links in code]]\` are ignored`
  );

  const tasks: Row[] = [];
  const subtasks: Row[] = [];
  const taskTags: Row[] = [];
  const task = (
    projectIndex: number,
    column: string,
    title: string,
    opts: {
      description?: string;
      priority?: string;
      start?: number;
      due?: number;
      done?: number;
      recurrence?: string;
      tags?: string[];
      subtasks?: [string, boolean, string?][];
      noteId?: string;
      archived?: boolean;
    } = {}
  ) => {
    const columnId = col(projectIndex, column);
    const t: Row = {
      ...base,
      id: id("eeee"),
      project_id: projects[projectIndex].id,
      column_id: columnId,
      title,
      description: opts.description ?? null,
      position: tasks.filter((x) => x.column_id === columnId).length,
      priority: opts.priority ?? "medium",
      start_date: opts.start !== undefined ? day(opts.start) : null,
      due_date: opts.due !== undefined ? day(opts.due) : null,
      completed_at: opts.done !== undefined ? ts(opts.done) : null,
      is_archived: opts.archived ?? false,
      recurrence_type: opts.recurrence ?? "none",
      recurrence_cron: null,
      recurrence_parent_id: null,
      note_id: opts.noteId ?? null,
    };
    tasks.push(t);
    (opts.tags ?? []).forEach((name) =>
      taskTags.push({ task_id: t.id, tag_id: tag(name), user_id: USER_ID, created_at: ts(-5) })
    );
    (opts.subtasks ?? []).forEach(([title, done, noteId], position) =>
      subtasks.push({
        ...base,
        id: id("ssss"),
        task_id: t.id,
        title,
        is_completed: done,
        position,
        note_id: noteId ?? null,
      })
    );
    return t;
  };

  // Website Relaunch — the board shown in most screenshots.
  task(0, "Backlog", "Write blog launch post", { priority: "low", tags: ["Content"] });
  task(0, "Backlog", "Research accessibility testing tools", { tags: ["Research"] });
  task(0, "Backlog", "Dark-mode illustrations", { priority: "low", tags: ["Design"], due: 21 });
  task(0, "Todo", "Pricing page layout", {
    priority: "high",
    tags: ["Design", "Frontend"],
    due: 1,
    subtasks: [
      ["Wireframe", true],
      ["Plan comparison table", false],
      ["FAQ section", false],
    ],
  });
  task(0, "Todo", "Weekly analytics review", {
    recurrence: "weekly",
    due: 0,
    tags: ["Research"],
  });
  task(0, "Todo", "Fix broken links in footer", { priority: "critical", tags: ["Bug"], due: -2 });
  task(0, "In Progress", "Launch checklist", {
    priority: "high",
    noteId: launchNote.id,
    due: 5,
    subtasks: [
      ["SEO audit", true, seoNote.id],
      ["Performance budget", false, perfNote.id],
    ],
  });
  task(0, "In Progress", "Homepage hero section", {
    description:
      "Build the new hero: headline, sub-headline, primary CTA and the animated illustration.\n\nCopy is final in the content doc.",
    priority: "high",
    tags: ["Frontend", "Design"],
    start: -3,
    due: 2,
    subtasks: [
      ["Headline and sub-headline", true],
      ["Primary call to action", true],
      ["Animated illustration", false],
      ["Responsive breakpoints", false],
    ],
  });
  task(0, "In Progress", "Contact form API", { tags: ["Backend"], due: 4 });
  task(0, "Review", "Newsletter signup", {
    tags: ["Frontend", "Backend"],
    due: -1,
    subtasks: [
      ["Form", true],
      ["Double opt-in email", true],
    ],
  });
  task(0, "Done", "Choose a CMS", { tags: ["Research"], done: -4, priority: "high" });
  task(0, "Done", "Brand colour palette", { tags: ["Design"], done: -6 });
  task(0, "Done", "Set up staging environment", { tags: ["Backend"], done: -40, archived: true });
  task(0, "Done", "Old landing page copy", { tags: ["Content"], done: -50, archived: true });

  // Other projects: just enough to give the dashboard tiles real counts.
  const fill = (p: number, n: number, overdue: number, done: number) => {
    for (let i = 0; i < n; i++)
      task(p, i < done ? "Done" : "Todo", `Task ${i + 1}`, {
        done: i < done ? -2 : undefined,
        due: i >= done && i < done + overdue ? -3 : 6,
      });
  };
  fill(1, 18, 2, 7);
  fill(2, 9, 0, 6);
  fill(3, 12, 1, 3);

  const profiles: Row[] = [
    {
      id: USER_ID,
      email: "alex@example.com",
      display_name: null,
      avatar_url: null,
      auto_archive_days: 30,
      created_at: ts(-60),
      updated_at: ts(-1),
    },
  ];

  return {
    profiles,
    projects,
    columns,
    tags,
    tasks,
    subtasks,
    task_tags: taskTags,
    notes,
    activity_log: [],
  };
}
