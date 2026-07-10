import { describe, expect, test } from "bun:test";
import {
  SUPPORT_DISCLOSURE_POLICY,
  isDisclosureOpen,
  splitBilingualHint,
  toggleDisclosure,
} from "./support-disclosure";

describe("explicit support disclosure", () => {
  test("開示は現在の教材に対する明示操作後だけ有効で、別教材では閉じる", () => {
    const opened = toggleDisclosure(null, "session-a:topic-a");
    expect(isDisclosureOpen(opened, "session-a:topic-a")).toBe(true);
    expect(isDisclosureOpen(opened, "session-b:topic-a")).toBe(false);
    expect(toggleDisclosure(opened, "session-a:topic-a")).toBeNull();
    expect(toggleDisclosure(opened, "session-b:topic-a")).toBe("session-b:topic-a");
  });

  test("全練習モードの支援は初期非表示かつ明示操作を要求する", () => {
    expect(SUPPORT_DISCLOSURE_POLICY.map((entry) => entry.surface)).toEqual([
      "warmup-japanese-hints",
      "topic-outline-japanese-hints",
      "four-three-two-japanese-hints",
      "four-three-two-model-talk-script",
      "sentence-answer-and-explanation",
      "listening-script-and-explanation",
      "shadowing-script-and-explanation",
      "library-script-and-explanation",
      "free-talk-translation",
      "reflection-explanation",
    ]);
    expect(SUPPORT_DISCLOSURE_POLICY.every((entry) => entry.initiallyHidden && entry.explicitAction)).toBe(true);
  });

  test("トピックの英日ヒントは最後の区切りだけを訳として分離する", () => {
    expect(splitBilingualHint("How I do it — sponge, soap, and hot water — スポンジと洗剤")).toEqual({
      en: "How I do it — sponge, soap, and hot water",
      ja: "スポンジと洗剤",
    });
    expect(splitBilingualHint("An English-only hint — with a dash")).toEqual({
      en: "An English-only hint — with a dash",
    });
  });
});
