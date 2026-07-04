import { z } from "zod";

export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200, "Keep it under 200 characters"),
    description: z.string().trim().max(5000).optional(),
    columnId: z.string().min(1, "Column is required"),
    priority: z.enum(["low", "medium", "high", "critical"]),
    startDate: z.string().optional().or(z.literal("")),
    dueDate: z.string().optional().or(z.literal("")),
    completedDate: z.string().optional().or(z.literal("")),
    recurrenceType: z.enum(["none", "daily", "weekly", "monthly", "custom"]),
    recurrenceCron: z.string().optional().or(z.literal("")),
  })
  .refine((data) => !data.startDate || !data.dueDate || data.startDate <= data.dueDate, {
    message: "Due date must be on or after the start date",
    path: ["dueDate"],
  })
  .refine((data) => data.recurrenceType !== "custom" || !!data.recurrenceCron?.trim(), {
    message: "Enter a cron expression for custom recurrence",
    path: ["recurrenceCron"],
  });

export type TaskFormInput = z.infer<typeof taskFormSchema>;
