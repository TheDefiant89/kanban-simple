import { useState } from "react";
import { Plus, Tag as TagIcon, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/shared/color-picker";
import { PROJECT_COLORS, type Tag } from "@/types";

interface TagSelectorProps {
  tags: Tag[];
  selectedIds: string[];
  onToggle: (tagId: string) => void;
  onCreate: (input: { name: string; color: string }) => Promise<Tag | void>;
}

export function TagSelector({ tags, selectedIds, onToggle, onCreate }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);

  const selected = tags.filter((t) => selectedIds.includes(t.id));

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await onCreate({ name, color: newColor });
    setNewName("");
    setNewColor(PROJECT_COLORS[0]);
    setCreating(false);
    if (created && "id" in created) onToggle(created.id);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Tags</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => onToggle(tag.id)}
              aria-label={`Remove ${tag.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-xs">
              <TagIcon className="h-3 w-3" /> Add tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto scrollbar-thin">
              {tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={selectedIds.includes(tag.id)}
                    onCheckedChange={() => onToggle(tag.id)}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </label>
              ))}
              {tags.length === 0 && !creating && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet</p>
              )}
            </div>

            {creating ? (
              <div className="mt-2 flex flex-col gap-2 border-t pt-2">
                <Input
                  autoFocus
                  placeholder="Tag name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreate())}
                />
                <ColorPicker colors={PROJECT_COLORS} value={newColor} onChange={setNewColor} />
                <div className="flex justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={handleCreate}>
                    Create
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 w-full justify-start border-t pt-2 text-xs"
                onClick={() => setCreating(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Create new tag
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
