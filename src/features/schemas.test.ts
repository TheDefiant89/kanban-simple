import { describe, it, expect } from "vitest";
import type { ZodType } from "zod";
import { loginSchema, registerSchema } from "@/features/auth/schemas";
import { columnColorSchema, columnNameSchema } from "@/features/board/schemas";
import { projectFormSchema } from "@/features/dashboard/schemas";
import { taskFormSchema } from "@/features/tasks/schemas";

// The forms show the first issue per field (the zodResolver default). These
// tests pin those user-facing messages so a zod or resolver upgrade can't
// silently change what the forms display.
function firstErrors(schema: ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  const out: Record<string, string> = {};
  if (result.success) return out;
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

describe("auth schemas", () => {
  it("reports a missing email before an invalid one", () => {
    expect(firstErrors(loginSchema, { email: "", password: "" })).toEqual({
      email: "Email is required",
      password: "Password is required",
    });
    expect(firstErrors(loginSchema, { email: "nope", password: "p" })).toEqual({
      email: "Enter a valid email address",
    });
  });

  it("checks password length and confirmation", () => {
    expect(
      firstErrors(registerSchema, { email: "a@b.co", password: "short", confirmPassword: "short" })
    ).toEqual({ password: "Password must be at least 8 characters" });
    expect(
      firstErrors(registerSchema, {
        email: "a@b.co",
        password: "longenough",
        confirmPassword: "different",
      })
    ).toEqual({ confirmPassword: "Passwords do not match" });
    expect(
      registerSchema.safeParse({
        email: "a@b.co",
        password: "longenough",
        confirmPassword: "longenough",
      }).success
    ).toBe(true);
  });
});

describe("column / project schemas", () => {
  it("trims names and validates hex colors", () => {
    expect(columnNameSchema.parse("  Todo  ")).toBe("Todo");
    expect(columnNameSchema.safeParse("   ").error?.issues[0].message).toBe(
      "Column name is required"
    );
    expect(columnColorSchema.safeParse("red").error?.issues[0].message).toBe(
      "Enter a valid hex color"
    );
    expect(firstErrors(projectFormSchema, { name: "", color: "" })).toEqual({
      name: "Project name is required",
      color: "Color is required",
    });
  });
});

describe("task form schema", () => {
  const base = { title: "T", columnId: "c", priority: "low", recurrenceType: "none" };

  it("accepts a minimal task and trims the title", () => {
    expect(taskFormSchema.parse({ ...base, title: "  T  " }).title).toBe("T");
  });

  it("rejects a due date before the start date", () => {
    expect(
      firstErrors(taskFormSchema, { ...base, startDate: "2026-02-01", dueDate: "2026-01-01" })
    ).toEqual({ dueDate: "Due date must be on or after the start date" });
  });

  it("requires a valid cron expression for custom recurrence", () => {
    expect(firstErrors(taskFormSchema, { ...base, recurrenceType: "custom" })).toEqual({
      recurrenceCron: "Enter a cron expression for custom recurrence",
    });
    expect(
      firstErrors(taskFormSchema, { ...base, recurrenceType: "custom", recurrenceCron: "bad" })
    ).toEqual({ recurrenceCron: "Enter a valid 5-field cron expression, e.g. 0 0 1 */3 *" });
    expect(
      taskFormSchema.safeParse({
        ...base,
        recurrenceType: "custom",
        recurrenceCron: "0 0 1 */3 *",
      }).success
    ).toBe(true);
  });
});
