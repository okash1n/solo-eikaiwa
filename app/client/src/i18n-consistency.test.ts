import { describe, expect, test } from "bun:test";
import { STR } from "./i18n";

describe("設定と練習画面の用語", () => {
  test("歯抜け表示の設定と画面操作を同じ語系にする", () => {
    expect(STR.en.support.cloze).toBe("Start with gaps");
    expect(STR.en.support.helpCloze).toContain("starts with gaps");
    expect(STR.en.sentences.showCloze).toBe("Show gaps");
    expect(STR.en.warmup.clozeStepTitle).toContain("gaps");
    expect(STR.ja.support.cloze).toBe("歯抜けで開始");
    expect(STR.ja.support.helpCloze).toContain("歯抜け表示");
    expect(STR.ja.support.helpCloze).not.toContain("穴埋め");
    expect(STR.ja.sentences.showCloze).toBe("歯抜けを表示");
    expect(STR.ja.warmup.clozeStepTitle).toContain("歯抜け");
  });
});

describe("フィードバックと設定の意味", () => {
  test("日本語の難易度フィードバックは行き過ぎを明示する", () => {
    const expected = { hard: "難しすぎた", "just-right": "ちょうどよかった", easy: "簡単すぎた" };
    expect(STR.ja.feedbackRow.hard).toBe(expected.hard);
    expect(STR.ja.feedbackRow.justRight).toBe(expected["just-right"]);
    expect(STR.ja.feedbackRow.easy).toBe(expected.easy);
    expect(STR.ja.feedbackScreen.rating).toEqual(expected);
  });

  test("設定注記・配信・effortの表記を実画面と両言語で揃える", () => {
    expect(STR.en.settings.claudeGlobalModelNote).toContain(STR.en.settings.roleAssignSection);
    expect(STR.en.settings.tuningEffort).toContain("thinking depth");
    expect(STR.en.settings.tuningTierFast).toContain("priority delivery");
    expect(STR.en.settings.tuningTierStandard).toContain("cheaper");
    expect(STR.en.settings.roleReason.assessment).toContain("Standard delivery");
    expect(STR.ja.settings.tuningEffort).toContain("思考の深さ");
    expect(STR.ja.settings.tuningTierFast).toContain("優先配信");
    expect(STR.ja.settings.tuningTierStandard).toContain("安価");
    expect(STR.ja.settings.roleReason.assessment).toContain("Standard 配信");
  });
});
