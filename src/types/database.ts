// Hand-written types mirroring supabase/migrations/20260703000000_initial_schema.sql.
// Regenerate with `supabase gen types typescript` once a live project exists
// if you want generated types instead.

export type Priority = "low" | "medium" | "high" | "critical";
export type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "custom";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Column = {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  color: string;
  position: number;
  is_collapsed: boolean;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  column_id: string;
  user_id: string;
  title: string;
  description: string | null;
  position: number;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  is_archived: boolean;
  recurrence_type: RecurrenceType;
  recurrence_cron: string | null;
  recurrence_parent_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Subtask = {
  id: string;
  task_id: string;
  user_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
};

export type TaskTag = {
  task_id: string;
  tag_id: string;
  user_id: string;
  created_at: string;
};

export type ActivityLogEntry = {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Partial<Project> & { user_id: string; name: string };
        Update: Partial<Project>;
        Relationships: [];
      };
      columns: {
        Row: Column;
        Insert: Partial<Column> & { project_id: string; user_id: string; name: string };
        Update: Partial<Column>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & {
          project_id: string;
          column_id: string;
          user_id: string;
          title: string;
        };
        Update: Partial<Task>;
        Relationships: [];
      };
      subtasks: {
        Row: Subtask;
        Insert: Partial<Subtask> & { task_id: string; user_id: string; title: string };
        Update: Partial<Subtask>;
        Relationships: [];
      };
      tags: {
        Row: Tag;
        Insert: Partial<Tag> & { user_id: string; name: string };
        Update: Partial<Tag>;
        Relationships: [];
      };
      task_tags: {
        Row: TaskTag;
        Insert: Partial<TaskTag> & { task_id: string; tag_id: string; user_id: string };
        Update: Partial<TaskTag>;
        Relationships: [];
      };
      activity_log: {
        Row: ActivityLogEntry;
        Insert: Partial<ActivityLogEntry> & { user_id: string; action: string };
        Update: Partial<ActivityLogEntry>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      delete_own_account: {
        Args: { current_password: string };
        Returns: "ok" | "incorrect_password" | "locked_out";
      };
      change_own_password: {
        Args: { current_password: string; new_password: string };
        Returns: "ok" | "incorrect_password" | "locked_out";
      };
      reorder_tasks: {
        Args: { updates: { id: string; position: number; column_id?: string }[] };
        Returns: undefined;
      };
      reorder_columns: {
        Args: { updates: { id: string; position: number }[] };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
