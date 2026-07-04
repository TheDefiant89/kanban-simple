import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-client";
import { createTag, deleteTag, listTags, updateTag } from "@/services/tags";

export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: listTags });
}

export function useTagMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.tags });

  const create = useMutation({
    mutationFn: createTag,
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to create tag"),
  });

  const update = useMutation({
    mutationFn: ({
      tagId,
      updates,
    }: {
      tagId: string;
      updates: { name?: string; color?: string };
    }) => updateTag(tagId, updates),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to update tag"),
  });

  const remove = useMutation({
    mutationFn: deleteTag,
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Failed to delete tag"),
  });

  return { create, update, remove };
}
