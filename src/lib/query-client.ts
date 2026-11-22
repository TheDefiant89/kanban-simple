import { MutationCache, QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /**
       * Shown as an error toast when the mutation fails and the error has no
       * message of its own. Mutations without it toast nothing (so ones that
       * word their own error, like quick-add, aren't doubled up).
       */
      errorMessage?: string;
    };
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      const fallback = mutation.meta?.errorMessage;
      if (fallback) toast.error(error.message || fallback);
    },
  }),
});

export const queryKeys = {
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  projectBySlug: (slug: string) => ["project-by-slug", slug] as const,
  columns: (projectId: string) => ["columns", projectId] as const,
  tasks: (projectId: string) => ["tasks", projectId] as const,
  tasksAll: ["tasks"] as const,
  archivedTasks: (projectId: string) => ["archived-tasks", projectId] as const,
  autoArchiveDays: ["profile", "auto-archive-days"] as const,
  tags: ["tags"] as const,
  notes: ["notes"] as const,
  noteTasks: ["note-tasks"] as const,
};

/** What an optimistic onMutate hands to onError so the patch can be undone. */
export interface OptimisticContext<T> {
  previous: T | undefined;
}

/**
 * The optimistic-update half of a mutation: stops in-flight fetches of `key`
 * from landing on top of the patch, snapshots the cache, then applies
 * `updater` (skipped when nothing is cached yet). Return the result from
 * onMutate and pass it to `rollback` in onError.
 */
export async function patchOptimistically<T>(
  client: QueryClient,
  key: QueryKey,
  updater: (old: T) => T
): Promise<OptimisticContext<T>> {
  await client.cancelQueries({ queryKey: key });
  const previous = client.getQueryData<T>(key);
  client.setQueryData<T>(key, (old) => (old === undefined ? old : updater(old)));
  return { previous };
}

export function rollback<T>(
  client: QueryClient,
  key: QueryKey,
  context: OptimisticContext<T> | undefined
) {
  if (context?.previous !== undefined) client.setQueryData(key, context.previous);
}
