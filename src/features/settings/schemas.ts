import { z } from "zod";

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required")
  .max(50, "Keep it under 50 characters");
