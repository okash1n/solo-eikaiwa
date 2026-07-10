import { describe, expect, test } from "bun:test";
import { needsPracticeReload, SENTENCE_SETTING_TIMING } from "./sentence-settings";

describe("例文練習の設定反映時点", () => {
  test("ヒントは現在、音からは次、件数はキュー再読み込みで反映する", () => {
    expect(SENTENCE_SETTING_TIMING.hideNote).toBe("current");
    expect(SENTENCE_SETTING_TIMING.audioFirst).toBe("next");
    expect(SENTENCE_SETTING_TIMING.newPerDay).toBe("reload");
  });

  test("出題件数を変えたときだけ、練習キューの再読み込みを求める", () => {
    expect(needsPracticeReload(10, 10)).toBe(false);
    expect(needsPracticeReload(3, 10)).toBe(true);
    expect(needsPracticeReload(5, 3)).toBe(true);
  });
});
