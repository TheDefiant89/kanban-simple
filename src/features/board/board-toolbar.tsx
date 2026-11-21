import { useEffect, useRef, useState } from "react";
import { Archive, CircleCheck, Filter, Search, Tag as TagIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  onOpenArchived: () => void;
  /** Lets the board's "/" shortcut focus the search box. */
  searchInputRef?: React.Ref<HTMLInputElement>;
}

export function BoardToolbar({
  filters,
  tags,
  onSearchChange,
  onDueChange,
  onTogglePriority,
  onToggleTag,
  onShowCompletedChange,
  onOpenArchived,
  searchInputRef,
}: BoardToolbarProps) {
  const filterRowRef = useRef<HTMLDivElement>(null);
  const overflow = useScrollOverflow(filterRowRef);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-background/60 px-3 py-2 sm:px-4 sm:py-2.5 short:min-w-0 short:flex-1 short:flex-nowrap short:border-b-0 short:py-1.5 short:pl-1 sm:short:py-1.5 sm:short:pl-1">
      <div className="relative w-full sm:max-w-xs short:w-36 short:shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          aria-keyshortcuts="/"
          className="peer pl-8 pointer-fine:pr-8"
          value={filters.search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            // Escape leaves the search box so board shortcuts work again.
            if (e.key === "Escape") e.currentTarget.blur();
          }}
        />
        {/* Shortcut hint for keyboard users; hidden on touch screens, while
            typing, and once there's a search term. */}
        {!filters.search && (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-panel-2 px-1.5 font-mono text-[11px] leading-5 text-muted-foreground pointer-fine:block peer-focus:hidden"
          >
            /
          </kbd>
        )}
      </div>

      {/* Phones: the filters share one horizontally swipeable row instead of
          wrapping onto three. From sm up the wrapper dissolves (`contents`)
          and the controls flow in the parent row as before. */}
      <div
        ref={filterRowRef}
        data-more-left={overflow.left}
        data-more-right={overflow.right}
        className="-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none] data-[more-left=true]:[mask-image:linear-gradient(to_right,transparent,#000_2.5rem)] data-[more-right=true]:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] data-[more-left=true]:data-[more-right=true]:[mask-image:linear-gradient(to_right,transparent,#000_2.5rem,#000_calc(100%-2.5rem),transparent)] sm:not-short:contents short:mx-0 short:w-auto short:min-w-0 short:flex-1 short:px-0 [&::-webkit-scrollbar]:hidden"
      >
        <Select value={filters.due} onValueChange={(v) => onDueChange(v as DueDateFilter)}>
          <SelectTrigger className="w-32 shrink-0 sm:w-40 short:w-28">
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

        {/* Phones: "Show completed" as a toggle chip next to the other
            filters, where it's visible without swiping. The labelled
            switch further along takes over from sm up. */}
        <Button
          variant="outline"
          size="sm"
          aria-pressed={filters.showCompleted}
          onClick={() => onShowCompletedChange(!filters.showCompleted)}
          className={cn(
            "shrink-0 sm:not-short:hidden",
            filters.showCompleted && "border-primary bg-primary/10 text-primary hover:text-primary"
          )}
        >
          <CircleCheck className="h-3.5 w-3.5" />
          Completed
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
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
            <Button variant="outline" size="sm" className="shrink-0">
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

        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <Switch
            className="max-sm:hidden short:hidden"
            id="show-completed"
            checked={filters.showCompleted}
            onCheckedChange={onShowCompletedChange}
          />
          <Label
            htmlFor="show-completed"
            className="whitespace-nowrap text-sm font-normal max-sm:hidden short:hidden"
          >
            Show completed
          </Label>
          {/* Icon-only on phones to keep the swipeable row short. */}
          <Button
            variant="outline"
            size="sm"
            className="max-sm:w-8 max-sm:px-0 sm:ml-1"
            onClick={onOpenArchived}
            title="Archived tasks"
          >
            <Archive className="h-4 w-4" />
            <span className="max-sm:sr-only">Archived</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Whether a horizontally scrollable element has content hidden past its left
 * and right edges. Drives the edge fades on the phone filter row, so a
 * clipped control reads as "swipe for more". Both stay false when the element
 * doesn't scroll (e.g. `display: contents` on wider screens).
 */
function useScrollOverflow(ref: React.RefObject<HTMLDivElement | null>) {
  const [overflow, setOverflow] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref]);
  return overflow;
}
