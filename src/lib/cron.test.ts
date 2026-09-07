import { describe, it, expect } from "vitest";
import { isValidCronExpression } from "@/lib/cron";

describe("isValidCronExpression", () => {
  it("accepts well-formed 5-field expressions", () => {
    expect(isValidCronExpression("0 0 1 */3 *")).toBe(true);
    expect(isValidCronExpression("0 9 * * 1")).toBe(true);
    expect(isValidCronExpression("0,15,30,45 * * * *")).toBe(true);
    expect(isValidCronExpression("0 0 1-5 * *")).toBe(true);
    expect(isValidCronExpression("0 0 5/2 * *")).toBe(true);
    expect(isValidCronExpression("* * * * *")).toBe(true);
    // day-of-week 0-7 (both 0 and 7 are Sunday)
    expect(isValidCronExpression("0 0 * * 7")).toBe(true);
  });

  it("rejects the wrong number of fields", () => {
    expect(isValidCronExpression("0 0 1 */3")).toBe(false);
    expect(isValidCronExpression("0 0 1 */3 * *")).toBe(false);
    expect(isValidCronExpression("")).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(isValidCronExpression("0 0 32 * *")).toBe(false); // day of month > 31
    expect(isValidCronExpression("0 0 1 13 *")).toBe(false); // month > 12
    expect(isValidCronExpression("0 0 1 8 8")).toBe(false); // day of week > 7
    expect(isValidCronExpression("60 0 1 1 1")).toBe(false); // minute > 59
    expect(isValidCronExpression("0 24 1 1 1")).toBe(false); // hour > 23
  });

  it("rejects malformed tokens", () => {
    expect(isValidCronExpression("abc 0 1 * *")).toBe(false);
    expect(isValidCronExpression("0 0 1 */0 *")).toBe(false); // zero step
    expect(isValidCronExpression("0 0 5-1 * *")).toBe(false); // inverted range
  });

  it("tolerates surrounding and repeated whitespace", () => {
    expect(isValidCronExpression("  0 0 1 */3 *  ")).toBe(true);
    expect(isValidCronExpression("0   0  1 */3   *")).toBe(true);
  });
});
