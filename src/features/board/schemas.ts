import { z } from "zod";

export const columnNameSchema = z
  .string()
  .trim()
  .min(1, "Column name is required")
  .max(100, "Keep it under 100 characters");

export const columnColorSchema = z
  .string()
  .trim()
  .min(1, "Color is required")
  .max(20, "Keep it under 20 characters")
  .regex(/^#[0-9a-fA-F]{3,8}$/, "Enter a valid hex color");
