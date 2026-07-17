import { describe, expect, test } from "bun:test";
import { recommendFirstStep } from "./first-step";

describe("first-step", () => {
  test("復習期限のカードが1枚以上ある日は暗記例文を第一提案にする", () => {
    expect(recommendFirstStep(1)).toEqual({ kind: "sentences", dueCount: 1 });
    expect(recommendFirstStep(12)).toEqual({ kind: "sentences", dueCount: 12 });
  });

  test("0枚の日は従来どおり音読ウォームアップを提案する", () => {
    expect(recommendFirstStep(0)).toEqual({ kind: "warmup" });
  });

  test("取得失敗（null）は静かにウォームアップへフォールバックする", () => {
    expect(recommendFirstStep(null)).toEqual({ kind: "warmup" });
  });

  test("不正値（負数・NaN・Infinity）でも壊れずウォームアップへ倒す", () => {
    expect(recommendFirstStep(-3)).toEqual({ kind: "warmup" });
    expect(recommendFirstStep(Number.NaN)).toEqual({ kind: "warmup" });
    expect(recommendFirstStep(Number.POSITIVE_INFINITY)).toEqual({ kind: "warmup" });
  });

  test("小数のdue数は切り捨てて表示用の枚数にする", () => {
    expect(recommendFirstStep(2.9)).toEqual({ kind: "sentences", dueCount: 2 });
  });
});
