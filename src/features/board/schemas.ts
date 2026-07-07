import { z } from "zod";

export const columnNameSchema = z
  .string()
  .trim()
  .min(1, "Column name is required")
  .max(100, "Keep it under 100 characters");
