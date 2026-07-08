import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorPicker } from "@/components/shared/color-picker";
import type { Column } from "@/types";
import { columnColorSchema, columnNameSchema } from "./schemas";

const COLUMN_COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
  "#22c55e",
  "#ef4444",
  "#0ea5e9",
  "#ec4899",
];

interface ColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column?: Column | null;
  onSubmit: (values: { name: string; color: string }) => Promise<void>;
  submitting?: boolean;
}

export function ColumnDialog({
  open,
  onOpenChange,
  column,
  onSubmit,
  submitting,
}: ColumnDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLUMN_COLORS[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(column?.name ?? "");
      setColor(column?.color ?? COLUMN_COLORS[0]);
      setError(null);
    }
  }, [open, column]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = columnNameSchema.safeParse(name);
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    const colorResult = columnColorSchema.safeParse(color);
    if (!colorResult.success) {
      setError(colorResult.error.issues[0].message);
      return;
    }
    try {
      await onSubmit({ name: result.data, color: colorResult.data });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("duplicate key") || message.includes("columns_project_name_unique")) {
        setError("A column with this name already exists on this board");
      } else {
        setError(message || "Something went wrong");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{column ? "Edit column" : "New column"}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="column-name">Name</Label>
            <Input
              id="column-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. In Review"
              maxLength={100}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Colour</Label>
            <ColorPicker colors={COLUMN_COLORS} value={color} onChange={setColor} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {column ? "Save changes" : "Create column"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
