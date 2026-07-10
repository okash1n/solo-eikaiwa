import { describe, expect, test } from "bun:test";
import { canGenerateMonthlyReview, localYmd, localYmdFromTimestamp } from "./dates";

describe("local date helpers", () => {
  test("UTC ISO timestampを閲覧環境のローカル日付へ戻す", () => {
    const localAfterMidnight = new Date(2026, 6, 10, 0, 30, 0);
    const timestamp = localAfterMidnight.toISOString();
    expect(localYmdFromTimestamp(timestamp)).toBe("2026-07-10");
    expect(localYmd(new Date(timestamp))).toBe("2026-07-10");
  });

  test("月次レビューは同じローカル暦月なら生成不可、前月なら月初から生成可", () => {
    const augustFirst = new Date(2026, 7, 1, 0, 1, 0);
    expect(canGenerateMonthlyReview(null, augustFirst)).toBe(true);
    expect(canGenerateMonthlyReview("2026-08-01", augustFirst)).toBe(false);
    expect(canGenerateMonthlyReview("2026-08-31", augustFirst)).toBe(false);
    expect(canGenerateMonthlyReview("2026-07-31", augustFirst)).toBe(true);
  });
});
