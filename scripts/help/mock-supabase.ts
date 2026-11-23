/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * In-memory stand-in for the Supabase client, used ONLY to render the Help
 * page screenshots with realistic demo data (see scripts/help/capture.mjs).
 * It is aliased over "@/supabase/client" by scripts/help/vite.config.ts and
 * is never part of the real app build.
 *
 * It implements just the slice of the PostgREST query builder the services
 * use: select (with nested embeds), insert/update/delete, eq/neq/is/not/in/
 * like/ilike filters, order, range, single, and the RPCs the UI calls.
 */
import { seed } from "./seed";

type Row = Record<string, any>;
const db: Record<string, Row[]> = seed();
const USER_ID = "00000000-0000-4000-8000-000000000001";

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const singular = (table: string) => table.replace(/s$/, "");

// ---------- select-string parsing & embedding ----------

interface SelectNode {
  columns: string[];
  embeds: { table: string; node: SelectNode }[];
}

function parseSelect(input: string): SelectNode {
  const node: SelectNode = { columns: [], embeds: [] };
  let i = 0;
  const parseList = (target: SelectNode) => {
    let token = "";
    while (i < input.length) {
      const ch = input[i];
      if (ch === "(") {
        i++;
        const child: SelectNode = { columns: [], embeds: [] };
        parseList(child);
        target.embeds.push({ table: token.trim(), node: child });
        token = "";
      } else if (ch === ")") {
        i++;
        if (token.trim()) target.columns.push(token.trim());
        return;
      } else if (ch === ",") {
        i++;
        if (token.trim()) target.columns.push(token.trim());
        token = "";
      } else {
        token += ch;
        i++;
      }
    }
    if (token.trim()) target.columns.push(token.trim());
  };
  parseList(node);
  return node;
}

function project(row: Row, table: string, node: SelectNode): Row {
  const out: Row = {};
  if (node.columns.includes("*") || (node.columns.length === 0 && node.embeds.length === 0)) {
    Object.assign(out, row);
  } else {
    for (const col of node.columns) out[col] = row[col];
  }
  for (const { table: child, node: childNode } of node.embeds) {
    const rows = db[child] ?? [];
    const fkOnChild = `${singular(table)}_id`;
    const fkOnParent = `${singular(child)}_id`;
    if (rows.length && fkOnChild in rows[0]) {
      out[child] = rows
        .filter((r) => r[fkOnChild] === row.id)
        .map((r) => project(r, child, childNode));
    } else if (fkOnParent in row) {
      const match = rows.find((r) => r.id === row[fkOnParent]);
      out[child] = match ? project(match, child, childNode) : null;
    } else {
      out[child] = [];
    }
  }
  return out;
}

// ---------- query builder ----------

type Filter = (row: Row) => boolean;
function likeToRegex(pattern: string, flags: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length)
      source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (ch === "%") source += ".*";
    else if (ch === "_") source += ".";
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, flags);
}

class Query implements PromiseLike<{ data: any; error: any }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private selectStr: string | null = null;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleRow = false;
  private payload: any = null;

  constructor(private table: string) {}

  select(columns = "*") {
    this.selectStr = columns;
    return this;
  }
  insert(values: any) {
    this.op = "insert";
    this.payload = values;
    return this;
  }
  update(values: any) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  upsert(values: any) {
    return this.insert(values);
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: any) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: any) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  is(col: string, v: any) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  not(col: string, op: string, v: any) {
    if (op === "is") this.filters.push((r) => (r[col] ?? null) !== v);
    else this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, values: any[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  like(col: string, pattern: string) {
    const re = likeToRegex(pattern, "");
    this.filters.push((r) => re.test(String(r[col] ?? "")));
    return this;
  }
  ilike(col: string, pattern: string) {
    const re = likeToRegex(pattern, "i");
    this.filters.push((r) => re.test(String(r[col] ?? "")));
    return this;
  }
  gte(col: string, v: any) {
    this.filters.push((r) => r[col] >= v);
    return this;
  }
  lte(col: string, v: any) {
    this.filters.push((r) => r[col] <= v);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ col, asc: opts.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  limit(n: number) {
    this.rangeFrom = 0;
    this.rangeTo = n - 1;
    return this;
  }
  single() {
    this.singleRow = true;
    return this;
  }
  maybeSingle() {
    this.singleRow = true;
    return this;
  }

  private run(): { data: any; error: any } {
    const table = (db[this.table] ??= []);
    let rows: Row[];
    if (this.op === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload];
      rows = list.map((values: Row) => {
        const row: Row = {
          id: uuid(),
          user_id: USER_ID,
          created_at: now(),
          updated_at: now(),
          ...defaultsFor(this.table),
          ...values,
        };
        table.push(row);
        return row;
      });
    } else if (this.op === "update") {
      rows = table.filter((r) => this.filters.every((f) => f(r)));
      for (const r of rows) Object.assign(r, this.payload, { updated_at: now() });
    } else if (this.op === "delete") {
      rows = table.filter((r) => this.filters.every((f) => f(r)));
      db[this.table] = table.filter((r) => !rows.includes(r));
    } else {
      rows = table.filter((r) => this.filters.every((f) => f(r)));
    }

    if (this.orders.length) {
      rows = [...rows].sort((a, b) => {
        for (const { col, asc } of this.orders) {
          if (a[col] === b[col]) continue;
          const cmp = a[col] < b[col] ? -1 : 1;
          return asc ? cmp : -cmp;
        }
        return 0;
      });
    }
    if (this.rangeFrom !== null) rows = rows.slice(this.rangeFrom, (this.rangeTo ?? 1e9) + 1);

    if (this.op !== "select" && this.selectStr === null) return { data: null, error: null };
    const node = parseSelect(this.selectStr ?? "*");
    const data = rows.map((r) => project(r, this.table, node));
    if (this.singleRow) {
      return data.length
        ? { data: data[0], error: null }
        : { data: null, error: { code: "PGRST116", message: "No rows found" } };
    }
    return { data, error: null };
  }

  then<A = { data: any; error: any }, B = never>(
    onFulfilled?: ((value: { data: any; error: any }) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: any) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return new Promise<{ data: any; error: any }>((resolve) =>
      setTimeout(() => resolve(this.run()), 20)
    ).then(onFulfilled, onRejected);
  }
}

function defaultsFor(table: string): Row {
  switch (table) {
    case "tasks":
      return {
        description: null,
        priority: "medium",
        start_date: null,
        due_date: null,
        completed_at: null,
        is_archived: false,
        recurrence_type: "none",
        recurrence_cron: null,
        recurrence_parent_id: null,
        note_id: null,
      };
    case "subtasks":
      return { is_completed: false, note_id: null };
    case "columns":
      return { is_collapsed: false, sort_by: "custom" };
    case "projects":
      return { description: null, is_archived: false };
    default:
      return {};
  }
}

// ---------- RPCs ----------

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rpc(name: string, args: Row): { data: any; error: any } {
  switch (name) {
    case "project_task_stats": {
      const t = args.p_today ?? today();
      return {
        data: db.projects.map((p) => {
          const tasks = db.tasks.filter((x) => x.project_id === p.id && !x.is_archived);
          return {
            project_id: p.id,
            task_count: tasks.length,
            completed_count: tasks.filter((x) => x.completed_at).length,
            overdue_count: tasks.filter((x) => !x.completed_at && x.due_date && x.due_date < t)
              .length,
          };
        }),
        error: null,
      };
    }
    case "reorder_tasks":
    case "reorder_columns": {
      const table = name === "reorder_tasks" ? db.tasks : db.columns;
      for (const u of args.updates) Object.assign(table.find((r) => r.id === u.id) ?? {}, u);
      return { data: null, error: null };
    }
    case "create_project_with_columns": {
      const p: Row = {
        id: uuid(),
        user_id: USER_ID,
        name: args.p_name,
        slug: args.p_slug,
        description: args.p_description,
        color: args.p_color,
        is_archived: false,
        created_at: now(),
        updated_at: now(),
      };
      db.projects.push(p);
      args.p_columns.forEach((c: Row, i: number) =>
        db.columns.push({
          id: uuid(),
          project_id: p.id,
          user_id: USER_ID,
          name: c.name,
          color: c.color,
          position: i,
          is_collapsed: false,
          sort_by: "custom",
          created_at: now(),
          updated_at: now(),
        })
      );
      return { data: p, error: null };
    }
    case "convert_note_to_task":
    case "duplicate_task":
    case "duplicate_project":
    case "sync_note_task_subtasks":
    case "change_own_password":
    case "delete_own_account":
    default:
      return { data: null, error: null };
  }
}

// ---------- auth ----------

const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "alex@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const session = {
  access_token: "demo",
  refresh_token: "demo",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user,
};
const signedIn = () => !location.pathname.match(/\/(login|register|forgot-password)/);

const auth = {
  getSession: async () => ({ data: { session: signedIn() ? session : null }, error: null }),
  getUser: async () => ({ data: { user }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  signInWithPassword: async () => ({ data: { session, user }, error: null }),
  signUp: async () => ({ data: { session: null, user }, error: null }),
  signOut: async () => ({ error: null }),
  resend: async () => ({ error: null }),
  resetPasswordForEmail: async () => ({ error: null }),
  updateUser: async () => ({ data: { user }, error: null }),
};

export const supabase = {
  from: (table: string) => new Query(table),
  rpc: (name: string, args: Row = {}) =>
    new Promise<{ data: any; error: any }>((resolve) =>
      setTimeout(() => resolve(rpc(name, args)), 20)
    ),
  auth,
} as any;
