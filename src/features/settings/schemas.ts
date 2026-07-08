import { z } from "zod";

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag name is required")
  .max(50, "Keep it under 50 characters");

export const tagColorSchema = z
  .string()
  .trim()
  .min(1, "Color is required")
  .max(20, "Keep it under 20 characters")
  .regex(/^#[0-9a-fA-F]{3,8}$/, "Enter a valid hex color");
