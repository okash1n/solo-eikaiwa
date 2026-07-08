import { describe, expect, test } from "bun:test";
import { calendarLevel } from "./calendar-level";

describe("calendarLevel", () => {
  test("活動なし→0 / 活動のみXP0→1", () => {
    expect(calendarLevel(false, undefined)).toBe(0);
    expect(calendarLevel(true, undefined)).toBe(1);
    expect(calendarLevel(true, 0)).toBe(1);
  });
  test("XP帯: 1–19→2 / 20–49→3 / 50+→4（done不問）", () => {
    expect(calendarLevel(true, 1)).toBe(2);
    expect(calendarLevel(false, 19)).toBe(2);
    expect(calendarLevel(true, 20)).toBe(3);
    expect(calendarLevel(true, 49)).toBe(3);
    expect(calendarLevel(true, 50)).toBe(4);
    expect(calendarLevel(false, 100)).toBe(4);
  });
});
