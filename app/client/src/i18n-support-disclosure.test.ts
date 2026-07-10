import { describe, expect, test } from "bun:test";
import { STR } from "./i18n";

describe("support disclosure wording", () => {
  test("モデル呼称とスクリプト呼称をEN/JAで統一する", () => {
    expect(STR.en.support.modelTalk).toContain("Model talk");
    expect(STR.en.support.helpModelTalk).toContain("model talk");
    expect(STR.ja.support.modelTalk).toContain("モデルトーク");
    expect(STR.ja.support.helpModelTalk).toContain("モデルトーク");
    expect(STR.en.ftt432.modelTranscript).toBe("Model talk script");
    expect(STR.ja.ftt432.modelTranscript).toBe("モデルトークのスクリプト");
    expect(STR.en.library.transcript).toBe("Model talk script");
    expect(STR.ja.library.transcript).toBe("モデルトークのスクリプト");
  });

  test("日本語ヒントの表示・非表示操作を両言語で提供する", () => {
    for (const lang of ["en", "ja"] as const) {
      expect(STR[lang].warmup.showJaHints).not.toBe("");
      expect(STR[lang].warmup.hideJaHints).not.toBe("");
      expect(STR[lang].ftt432.showJaHints).not.toBe("");
      expect(STR[lang].ftt432.hideJaHints).not.toBe("");
    }
  });
});
