import { describe, expect, test } from "bun:test";
import { loadContent, DOMAINS } from "../content";
import { SCENARIOS_DIR, TOPICS_DIR } from "../paths";

describe("scenarios: stage1 帯カバレッジ", () => {
  test("全ドメインが stage1 で帯域内(level[0]===1)のシナリオを最低1本持つ", () => {
    const scenarios = loadContent(SCENARIOS_DIR);
    for (const d of DOMAINS) {
      const stage1 = scenarios.filter((s) => s.domain === d && s.level[0] === 1);
      expect({ domain: d, count: stage1.length }).toEqual({ domain: d, count: expect.any(Number) });
      expect(stage1.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("topics: stage1 帯カバレッジ", () => {
  test("全ドメインが stage1 で帯域内(level[0]===1)のお題を最低2本持つ（ローテーションで固定化しない）", () => {
    const topics = loadContent(TOPICS_DIR);
    for (const d of DOMAINS) {
      const stage1 = topics.filter((t) => t.domain === d && t.level[0] === 1);
      expect({ domain: d, count: stage1.length }).toEqual({ domain: d, count: expect.any(Number) });
      expect(stage1.length).toBeGreaterThanOrEqual(2);
    }
  });
});
