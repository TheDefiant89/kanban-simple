import { z } from "zod";

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(80, "Keep it under 80 characters"),
  description: z.string().trim().max(500, "Keep it under 500 characters").optional(),
  color: z
    .string()
    .trim()
    .min(1, "Color is required")
    .max(20, "Keep it under 20 characters")
    .regex(/^#[0-9a-fA-F]{3,8}$/, "Enter a valid hex color"),
});
export type ProjectFormInput = z.infer<typeof projectFormSchema>;
