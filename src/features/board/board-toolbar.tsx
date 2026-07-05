import { Filter, Search, Tag as TagIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  type DueDateFilter,
  type Priority,
  type Tag,
  type TaskFilters,
} from "@/types";

const DUE_OPTIONS: { value: DueDateFilter; label: string }[] = [
  { value: "all", label: "All tasks" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "none", label: "No due date" },
  { value: "completed", label: "Completed" },
];

interface BoardToolbarProps {
  filters: TaskFilters;
  tags: Tag[];
  onSearchChange: (value: string) => void;
  onDueChange: (value: DueDateFilter) => void;
  onTogglePriority: (priority: Priority) => void;
  onToggleTag: (tagId: string) => void;
  onShowCompletedChange: (value: boolean) => void;
}

export function BoardToolbar({
  filters,
  tags,
  onSearchChange,
  onDueChange,
  onTogglePriority,
  onToggleTag,
  onShowCompletedChange,
}: BoardToolbarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-background/60 px-4 py-2.5">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="pl-8"
          value={filters.search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Select value={filters.due} onValueChange={(v) => onDueChange(v as DueDateFilter)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DUE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="h-3.5 w-3.5" />
            Priority
            {filters.priorities.length > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {filters.priorities.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PRIORITIES.map((p) => (
            <DropdownMenuCheckboxItem
              key={p}
              checked={filters.priorities.includes(p)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onTogglePriority(p)}
            >
              {PRIORITY_LABELS[p]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <TagIcon className="h-3.5 w-3.5" />
            Tags
            {filters.tagIds.length > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {filters.tagIds.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {tags.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet</p>
          )}
          {tags.map((tag) => (
            <DropdownMenuCheckboxItem
              key={tag.id}
              checked={filters.tagIds.includes(tag.id)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggleTag(tag.id)}
            >
              <span
                className="mr-2 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              {tag.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-2">
        <Switch
          id="show-completed"
          checked={filters.showCompleted}
          onCheckedChange={onShowCompletedChange}
        />
        <Label htmlFor="show-completed" className="whitespace-nowrap text-sm font-normal">
          Show completed
        </Label>
      </div>
    </div>
  );
}
