import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorPicker } from "@/components/shared/color-picker";
import { PROJECT_COLORS, type Project } from "@/types";
import { projectFormSchema, type ProjectFormInput } from "./schemas";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSubmit: (values: ProjectFormInput) => Promise<void>;
  submitting?: boolean;
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
  submitting,
}: ProjectDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<ProjectFormInput>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", description: "", color: PROJECT_COLORS[0] },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: project?.name ?? "",
        description: project?.description ?? "",
        color: project?.color ?? PROJECT_COLORS[0],
      });
    }
  }, [open, project, reset]);

  const color = watch("color");

  const handleFormSubmit = async (values: ProjectFormInput) => {
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("duplicate key") || message.includes("projects_user_name_unique")) {
        setError("name", { message: "You already have a project with this name" });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Rename project" : "New project"}</DialogTitle>
          <DialogDescription>
            {project ? "Update your project details." : "Give your new Kanban board a name."}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit(handleFormSubmit)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              autoFocus
              placeholder="e.g. Marketing Launch"
              {...register("name")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              placeholder="What is this project about?"
              rows={3}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Colour</Label>
            <ColorPicker
              colors={PROJECT_COLORS}
              value={color}
              onChange={(c) => setValue("color", c)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
