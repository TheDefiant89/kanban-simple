import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface SubtaskItem {
  id: string;
  title: string;
  is_completed: boolean;
}

interface SubtaskListProps {
  subtasks: SubtaskItem[];
  onAdd: (title: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}

export function SubtaskList({ subtasks, onAdd, onToggle, onDelete }: SubtaskListProps) {
  const [newTitle, setNewTitle] = useState("");
  const completed = subtasks.filter((s) => s.is_completed).length;

  const handleAdd = () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewTitle("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Subtasks</Label>
        {subtasks.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {completed} / {subtasks.length} completed
          </span>
        )}
      </div>

      {subtasks.length > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${subtasks.length ? (completed / subtasks.length) * 100 : 0}%` }}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {subtasks.map((subtask) => (
          <div
            key={subtask.id}
            className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50"
          >
            <Checkbox
              checked={subtask.is_completed}
              onCheckedChange={(checked) => onToggle(subtask.id, checked === true)}
            />
            <span
              className={
                subtask.is_completed
                  ? "flex-1 text-sm text-muted-foreground line-through"
                  : "flex-1 text-sm"
              }
            >
              {subtask.title}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={() => onDelete(subtask.id)}
              aria-label="Delete subtask"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Add a subtask…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleAdd}
          aria-label="Add subtask"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
