import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUTO_ARCHIVE_OPTIONS,
  getAutoArchiveDays,
  setAutoArchiveDays,
  type AutoArchiveDays,
} from "@/services/profile";
import { patchOptimistically, queryKeys, rollback } from "@/lib/query-client";

const label = (days: AutoArchiveDays) => (days === null ? "Never" : `After ${days} days`);
const toValue = (days: AutoArchiveDays) => (days === null ? "off" : String(days));
const fromValue = (value: string): AutoArchiveDays =>
  value === "off" ? null : (Number(value) as AutoArchiveDays);

export function AutoArchiveSetting() {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: queryKeys.autoArchiveDays, queryFn: getAutoArchiveDays });

  const update = useMutation({
    mutationFn: setAutoArchiveDays,
    onMutate: (days) =>
      patchOptimistically<AutoArchiveDays>(queryClient, queryKeys.autoArchiveDays, () => days),
    onSuccess: (_data, days) =>
      toast.success(
        days === null ? "Auto-archive turned off" : `Completed tasks will be archived after ${days} days`
      ),
    onError: (_error, _days, context) =>
      rollback(queryClient, queryKeys.autoArchiveDays, context),
    meta: { errorMessage: "Failed to update auto-archive" },
  });

  if (setting.isPending) return <Skeleton className="h-9 w-48" />;
  if (setting.isError)
    return <p className="text-sm text-destructive">Couldn't load this setting.</p>;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="auto-archive-days">Archive completed tasks</Label>
      <Select
        value={toValue(setting.data)}
        onValueChange={(value) => update.mutate(fromValue(value))}
        disabled={update.isPending}
      >
        <SelectTrigger id="auto-archive-days" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUTO_ARCHIVE_OPTIONS.map((days) => (
            <SelectItem key={toValue(days)} value={toValue(days)}>
              {label(days)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Runs once a night.</p>
    </div>
  );
}
