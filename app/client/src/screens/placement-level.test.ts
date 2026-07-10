import { describe, expect, test } from "bun:test";
import { validatePlacementLevel } from "./placement-level";

describe("レベル測定の任意開始Lv", () => {
  test("1から999までの整数だけを受け入れる", () => {
    expect(validatePlacementLevel("1")).toEqual({ valid: true, level: 1 });
    expect(validatePlacementLevel("013")).toEqual({ valid: true, level: 13 });
    expect(validatePlacementLevel("999")).toEqual({ valid: true, level: 999 });
  });

  test("空欄・小数・文字列・範囲外を送信前に区別する", () => {
    expect(validatePlacementLevel("")).toEqual({ valid: false, reason: "required" });
    expect(validatePlacementLevel("12.5")).toEqual({ valid: false, reason: "whole-number" });
    expect(validatePlacementLevel("Lv 12")).toEqual({ valid: false, reason: "whole-number" });
    expect(validatePlacementLevel("0")).toEqual({ valid: false, reason: "range" });
    expect(validatePlacementLevel("1000")).toEqual({ valid: false, reason: "range" });
  });
});
