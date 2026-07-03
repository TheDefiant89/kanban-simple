import { z } from "zod";

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(80, "Keep it under 80 characters"),
  description: z.string().trim().max(500, "Keep it under 500 characters").optional(),
  color: z.string().min(1),
});
export type ProjectFormInput = z.infer<typeof projectFormSchema>;
