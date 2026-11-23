import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { useDocumentTitle } from "@/lib/use-document-title";
import shotSizes from "./help-shots.json";

// Screenshots live in public/help/ and are regenerated with
// scripts/help/capture.cjs (see the comment at the top of that file).
const img = (name: string) => `${import.meta.env.BASE_URL}help/${name}.webp`;

function Shot({ name, alt, narrow }: { name: string; alt: string; narrow?: boolean }) {
  return (
    <figure className={narrow ? "mx-auto w-full max-w-md" : "w-full"}>
      <a href={img(name)} target="_blank" rel="noreferrer" title="Open full size">
        <img
          src={img(name)}
          alt={alt}
          width={(shotSizes as Record<string, number[]>)[name]?.[0]}
          height={(shotSizes as Record<string, number[]>)[name]?.[1]}
          loading="lazy"
          decoding="async"
          className="h-auto w-full rounded-xl border bg-panel shadow-sm"
        />
      </a>
      <figcaption className="mt-1.5 text-center text-xs text-muted-foreground">{alt}</figcaption>
    </figure>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-panel-2 px-1.5 py-0.5 font-mono text-[12px] text-muted-foreground">
      {children}
    </kbd>
  );
}

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting started",
    body: (
      <>
        <p>
          Create an account with <b>Sign up</b>, confirm your email from the link we send, then sign
          in. Forgot your password? Use <b>Forgot password?</b> on the sign-in screen and follow the
          link in the email. Your session is remembered, so you stay signed in on this device until
          you sign out.
        </p>
        <Shot name="sign-in" alt="The sign-in screen" narrow />
      </>
    ),
  },
  {
    id: "projects",
    title: "Projects (the dashboard)",
    body: (
      <>
        <p>
          The dashboard shows each project as a tile with its number of tasks, how many are done,
          and how many are overdue. Use the search box to find a project by name, the sort menu to
          order by <b>Recently updated</b>, <b>Created date</b> or <b>Name</b>, and the{" "}
          <b>Archived</b> switch to show archived projects. Click a tile to open its board.
        </p>
        <Shot name="dashboard" alt="The dashboard with four projects" />
        <p>
          Click <b>New project</b> (or the round <b>+</b> button on a phone), give it a name, an
          optional description and a colour. Every new project starts with the columns Backlog,
          Todo, In Progress, Review and Done.
        </p>
        <Shot name="project-new" alt="Creating a new project" narrow />
        <p>
          The <b>⋯</b> menu on a tile lets you <b>Open</b>, <b>Rename</b>, <b>Duplicate</b> (copies
          its columns, tasks, subtasks and tags), <b>Archive</b> / <b>Unarchive</b> or <b>Delete</b>{" "}
          the project. Deleting can&apos;t be undone; archiving can.
        </p>
        <Shot name="project-menu" alt="The project actions menu" />
      </>
    ),
  },
  {
    id: "board",
    title: "The board",
    body: (
      <>
        <p>
          A board is a row of columns, each holding task cards. A card shows the task&apos;s tags,
          priority, due date (red when overdue), subtask progress, and icons for a repeating task or
          a linked note. Tick the circle on a card to mark it complete. Click anywhere else on the
          card to open it.
        </p>
        <Shot name="board" alt="A project board" />
        <p>
          <b>Drag and drop</b> a card to reorder it within a column or move it to another column.
          Drag a column by its header to reorder columns. Changes are saved straight away.
        </p>
      </>
    ),
  },
  {
    id: "columns",
    title: "Columns",
    body: (
      <>
        <p>
          Scroll to the end of the board and click <b>Add column</b> to create one. Each column
          header has three buttons:
        </p>
        <ul>
          <li>
            <b>Sort</b> (⇅): show the column&apos;s tasks in your own drag-and-drop order (
            <b>Custom order</b>) or sorted by <b>Priority</b>, <b>Due date</b>, <b>Name</b> or{" "}
            <b>Tag</b>. Dragging a card in a sorted column switches it back to custom order.
          </li>
          <li>
            <b>Collapse</b> (⌄): fold the column into a thin strip to save space. Click the strip to
            expand it again.
          </li>
          <li>
            <b>⋯</b>: <b>Edit column</b> (rename and change its colour) or <b>Delete column</b>.
          </li>
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shot name="column-sort" alt="Choosing how a column is sorted" />
          <Shot name="column-actions" alt="Editing or deleting a column" />
        </div>
        <Shot name="column-collapsed" alt="A collapsed Backlog column" />
      </>
    ),
  },
  {
    id: "adding-tasks",
    title: "Adding tasks",
    body: (
      <>
        <p>
          Click <b>Add task</b> at the bottom of a column, type a title and press <Kbd>Enter</Kbd>.
          The box stays open so you can type the next one straight away; press <Kbd>Esc</Kbd> when
          you&apos;re done. Paste several lines at once and you&apos;ll be offered one task per line
          (up to 20).
        </p>
        <p>
          Want to set more than a title? Click <b>Add with details…</b> to open the full task form
          with the title already filled in.
        </p>
        <Shot name="quick-add" alt="Adding a task to a column" narrow />
      </>
    ),
  },
  {
    id: "task-details",
    title: "Task details",
    body: (
      <>
        <p>Open a task to edit everything about it:</p>
        <ul>
          <li>
            <b>Title</b> and <b>Description</b>.
          </li>
          <li>
            <b>Column</b> (move it), <b>Priority</b> (Low, Medium, High, Critical) and{" "}
            <b>Recurrence</b>.
          </li>
          <li>
            <b>Start date</b>, <b>Due date</b> and <b>Completed</b> date. Ticking Completed is the
            same as ticking the card.
          </li>
          <li>
            <b>Tags</b>: click <b>Add tag</b> to pick an existing tag or type a new one; click the ×
            on a tag to remove it.
          </li>
          <li>
            <b>Subtasks</b>: type in <b>Add a subtask…</b> and press Enter. Tick them off as you go;
            the bar shows progress, also shown on the card (for example 2/4).
          </li>
        </ul>
        <p>
          At the bottom you can <b>Duplicate</b> the task (with its subtasks and tags),{" "}
          <b>Archive</b> it, or <b>Delete</b> it. Click <b>Save changes</b> to keep your edits.
        </p>
        <Shot name="task-dialog" alt="Editing a task" />
      </>
    ),
  },
  {
    id: "recurring",
    title: "Repeating tasks",
    body: (
      <>
        <p>
          Set <b>Recurrence</b> to <b>Daily</b>, <b>Weekly</b>, <b>Monthly</b> or <b>Custom</b> (a
          cron expression). When you complete a repeating task, it stays completed and a fresh copy
          appears in the same column with its dates moved forward. Its tags come with it, and its
          subtasks are reset. If you finish a task after its due date, the next due date is counted
          from the day you finished it, so it isn&apos;t already overdue.
        </p>
        <p>Repeating tasks show a ⟳ icon on their card.</p>
        <Shot name="task-recurring" alt="A task that repeats weekly" narrow />
      </>
    ),
  },
  {
    id: "filters",
    title: "Search and filters",
    body: (
      <>
        <p>The toolbar above the board narrows down which tasks are shown:</p>
        <ul>
          <li>
            <b>Search tasks…</b> matches the title, description and tag names as you type.
          </li>
          <li>
            The <b>date filter</b> shows All tasks, Overdue, Today, Tomorrow, This week, This month,
            No due date, or Completed.
          </li>
          <li>
            <b>Priority</b> and <b>Tags</b> let you pick one or more values; the number on the
            button shows how many are selected.
          </li>
          <li>
            <b>Show completed</b>: completed tasks are hidden until you switch this on.
          </li>
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shot name="due-filter" alt="Filtering by due date" />
          <Shot name="filters" alt="Showing only High and Critical tasks" />
        </div>
        <Shot name="show-completed" alt="Completed tasks shown in the Done column" />
      </>
    ),
  },
  {
    id: "archive",
    title: "Archiving",
    body: (
      <>
        <p>
          Archived tasks are put away without deleting them. Archive a task from its details, or let
          it happen automatically: in <b>Settings → Auto-archive</b>, choose how many days a task
          stays on the board after it&apos;s completed.
        </p>
        <p>
          Click <b>Archived</b> in the board toolbar to see a project&apos;s archived tasks, search
          them, and <b>Unarchive</b> one to put it back in its column.
        </p>
        <Shot name="archived" alt="The archived tasks list" narrow />
      </>
    ),
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    body: (
      <>
        <p>On a board, when you&apos;re not typing in a box:</p>
        <ul>
          <li>
            <Kbd>N</Kbd> add a task to the first column
          </li>
          <li>
            <Kbd>/</Kbd> jump to the search box
          </li>
          <li>
            <Kbd>C</Kbd> show or hide completed tasks
          </li>
          <li>
            <Kbd>Esc</Kbd> close the add-task box or a dialog
          </li>
          <li>
            <Kbd>?</Kbd> list these shortcuts
          </li>
        </ul>
        <p>
          In a note, <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd> + <Kbd>S</Kbd> saves it.
        </p>
        <Shot name="shortcuts" alt="The keyboard shortcuts list" narrow />
      </>
    ),
  },
  {
    id: "notes",
    title: "Notes",
    body: (
      <>
        <p>
          Click the notebook icon in the top bar to open your notes beside whatever you&apos;re
          working on. Notes are yours across all projects. Click the page-plus icon to create one,
          or search them by title.
        </p>
        <p>
          <b>Folders come from links.</b> Put a link like <code>[[Launch checklist]]</code> on the{" "}
          <b>first line</b> of a note and it is filed under that note. Links further down are
          ordinary cross-references you can click. Clicking a link to a note that doesn&apos;t exist
          yet creates it. Typing <code>[[</code> suggests note titles.
        </p>
        <Shot name="notes-tree" alt="Notes grouped into folders" narrow />
        <p>
          Notes are written in markdown: headings, lists, checklists, tables, code and links. Switch
          between <b>Write</b> and <b>Preview</b> at the top of the note. Unsaved changes are kept
          as a draft (shown by a dot in the list) until you save or discard them, even if you switch
          notes or reload. Renaming a note updates every link to it.
        </p>
        <Shot name="notes-editor" alt="Writing a note in markdown" />
        <Shot name="notes-preview" alt="The notes panel next to a board, showing a preview" />
      </>
    ),
  },
  {
    id: "notes-to-tasks",
    title: "Turning notes into tasks",
    body: (
      <>
        <p>
          From a note&apos;s <b>⋯</b> menu choose <b>Convert to task</b>, then pick a project and
          column. The note becomes a task and each of its sub-notes becomes a subtask.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Shot name="notes-menu" alt="The note menu" />
          <Shot name="notes-convert" alt="Choosing where the new task goes" />
        </div>
        <p>
          The task and note stay linked. The card shows a notebook icon that opens the note, and the
          task shows the note&apos;s content. The note shows its task; click it to go to that board.
          If you add more sub-notes later, choose <b>Update task</b> from the note&apos;s menu to
          add them as subtasks. Deleting the note keeps the task.
        </p>
        <Shot name="task-linked-note" alt="A task linked to a note" narrow />
      </>
    ),
  },
  {
    id: "tags",
    title: "Managing tags",
    body: (
      <>
        <p>
          Tags are shared by all your projects. In <b>Settings → Tags</b> you can rename a tag,
          change its colour by clicking the dot, delete it (it is removed from every task), or
          create a new one.
        </p>
        <Shot name="settings-tags" alt="Managing tags in Settings" narrow />
      </>
    ),
  },
  {
    id: "appearance",
    title: "Light and dark theme",
    body: (
      <>
        <p>
          Use the moon/sun button in the top bar to choose <b>Light</b>, <b>Dark</b>, or{" "}
          <b>System</b> (follows your device).
        </p>
        <Shot name="theme-menu" alt="Choosing a theme" narrow />
        <Shot name="board-light" alt="The board in the light theme" />
      </>
    ),
  },
  {
    id: "mobile",
    title: "On your phone",
    body: (
      <>
        <p>
          The board shows one column at a time; swipe sideways to move between columns. Scrolling
          works normally. To drag a card or column, <b>press and hold</b> it first. The filters sit
          in one row you can swipe, and <b>Completed</b> is a button there.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Shot name="mobile-dashboard" alt="Dashboard on a phone" />
          <Shot name="mobile-board" alt="Board on a phone" />
        </div>
      </>
    ),
  },
  {
    id: "account",
    title: "Your account and data",
    body: (
      <>
        <p>
          Open Settings with the gear icon in the top bar (or from the avatar menu). There you can:
        </p>
        <ul>
          <li>see your email address and change your password,</li>
          <li>sign out,</li>
          <li>manage tags and auto-archive,</li>
          <li>
            <b>Export as CSV</b>: download all your projects, columns, tasks, subtasks and tags,
          </li>
          <li>
            <b>Delete my account</b>: permanently removes your account and all your data. You
            confirm by typing DELETE and your password.
          </li>
        </ul>
        <Shot name="settings" alt="The Settings page" />
      </>
    ),
  },
];

export default function Help() {
  useDocumentTitle("How-to guide");
  const { user } = useAuth();
  const navigate = useNavigate();

  const goBack = () => {
    // Back to where the reader came from, if that was inside the app.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(user ? "/settings" : "/login");
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Link to={user ? "/dashboard" : "/login"} className="flex items-center gap-2.5">
          <div className="bg-accent-grad flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-white">
            <LayoutGrid className="h-4 w-4" />
          </div>
          <span className="font-display text-[15px] font-semibold">How-to guide</span>
        </Link>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-8 sm:px-6">
        <nav aria-label="Contents" className="sticky top-22 hidden h-fit w-52 shrink-0 lg:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contents
          </p>
          <ol className="flex flex-col gap-1 text-sm">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-panel hover:text-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0 max-w-3xl flex-1">
          <div className="mb-8">
            <h1 className="font-display flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <BookOpen className="h-7 w-7 text-primary" /> How to use Kanban Simple
            </h1>
            <p className="mt-2 text-muted-foreground">
              A short tour of every feature, with screenshots. Click a screenshot to see it full
              size.
            </p>
          </div>

          <details className="mb-8 rounded-xl border bg-panel p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold">Contents</summary>
            <ol className="mt-2 flex flex-col gap-1 text-sm">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="mb-12 scroll-mt-20 [&_code]:rounded [&_code]:bg-panel-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_li]:mb-1 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5"
            >
              <h2 className="font-display mb-3 text-xl font-semibold tracking-tight">
                {section.title}
              </h2>
              <div className="flex flex-col gap-4 text-[15px]">{section.body}</div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
