import { describe, expect, test } from "bun:test";
import { shouldShowLlmNotice } from "./llm-notice";

describe("shouldShowLlmNotice", () => {
  test("health.llmReady===falseかつ未読なら表示する", () => {
    expect(shouldShowLlmNotice({ llmReady: false }, false)).toBe(true);
  });

  test("health.llmReady===trueなら表示しない", () => {
    expect(shouldShowLlmNotice({ llmReady: true }, false)).toBe(false);
  });

  test("既読(dismissed=true)なら llmReady===false でも表示しない", () => {
    expect(shouldShowLlmNotice({ llmReady: false }, true)).toBe(false);
  });

  test("health自体がnull（未取得/サーバ未応答）なら表示しない", () => {
    expect(shouldShowLlmNotice(null, false)).toBe(false);
  });

  test("旧サーバ応答（llmReadyフィールド自体が無い＝undefined）では表示しない（!undefinedがtrueになる誤検知を防ぐ）", () => {
    expect(shouldShowLlmNotice({} as { llmReady?: boolean }, false)).toBe(false);
  });
});
