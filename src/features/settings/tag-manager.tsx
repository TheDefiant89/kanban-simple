import { useEffect, useState } from "react";
import { Loader2, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ColorPicker } from "@/components/shared/color-picker";
import { useTagMutations, useTags } from "@/features/board/use-tags";
import { PROJECT_COLORS, type Tag } from "@/types";
import { tagNameSchema } from "./schemas";

function ColorSwatchButton({
  color,
  label,
  onChange,
}: {
  color: string;
  label: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-5 w-5 shrink-0 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ backgroundColor: color }}
          aria-label={label}
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <ColorPicker
          colors={PROJECT_COLORS}
          value={color}
          onChange={(c) => {
            onChange(c);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function TagRow({ tag }: { tag: Tag }) {
  const { update, remove } = useTagMutations();
  const [name, setName] = useState(tag.name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => setName(tag.name), [tag.name]);

  const commitName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === tag.name) {
      setName(tag.name);
      return;
    }
    const result = tagNameSchema.safeParse(trimmed);
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      setName(tag.name);
      return;
    }
    try {
      await update.mutateAsync({ tagId: tag.id, updates: { name: result.data } });
    } catch {
      setName(tag.name);
    }
  };

  const handleColorChange = (color: string) => {
    if (color !== tag.color) {
      update.mutate({ tagId: tag.id, updates: { color } });
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <ColorSwatchButton
        color={tag.color}
        label={`Change color for ${tag.name}`}
        onChange={handleColorChange}
      />

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setName(tag.name);
        }}
        className="h-8 flex-1"
        aria-label="Tag name"
        maxLength={50}
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
        aria-label={`Delete ${tag.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{tag.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the tag from every task it's currently applied to across all projects.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => remove.mutate(tag.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function TagManager() {
  const { data: tags = [], isLoading } = useTags();
  const { create } = useTagMutations();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const result = tagNameSchema.safeParse(trimmed);
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }
    await create.mutateAsync({ name: result.data, color: newColor });
    setNewName("");
    setNewColor(PROJECT_COLORS[0]);
  };

  return (
    <div className="flex flex-col gap-3">
      {isLoading && <p className="text-sm text-muted-foreground">Loading tags…</p>}

      {!isLoading && tags.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <TagIcon className="h-4 w-4" /> No tags yet. Create one below.
        </p>
      )}

      {tags.map((tag) => (
        <TagRow key={tag.id} tag={tag} />
      ))}

      <form
        className="flex items-center gap-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleCreate();
        }}
      >
        <ColorSwatchButton color={newColor} label="Choose new tag color" onChange={setNewColor} />
        <Input
          placeholder="New tag name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-8 flex-1"
          aria-label="New tag name"
          maxLength={50}
        />
        <Button type="submit" size="sm" disabled={create.isPending || !newName.trim()}>
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </Button>
      </form>
    </div>
  );
}
