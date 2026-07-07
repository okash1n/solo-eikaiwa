import { describe, expect, test } from "bun:test";
import { DOMAINS } from "../content";
import { loadListening } from "../listening";
import { LISTENING_DIR } from "../paths";

/** リポジトリ同梱の多聴素材（content/listening）の整合性 */
describe("listening content integrity", () => {
  const items = loadListening(LISTENING_DIR);

  test("6本以上パースできる", () => {
    expect(items.length).toBeGreaterThanOrEqual(6);
  });

  test("3ドメインすべてに1本以上ある", () => {
    for (const domain of DOMAINS) {
      expect(items.filter((i) => i.domain === domain).length).toBeGreaterThanOrEqual(1);
    }
  });

  test("下帯（stage3 に適合）と上帯（stage5 に適合）の両方に素材がある", () => {
    expect(items.some((i) => i.level[0] <= 3 && 3 <= i.level[1])).toBe(true);
    expect(items.some((i) => i.level[0] <= 5 && 5 <= i.level[1])).toBe(true);
  });

  test("全 item は段落2以上・level が 1..6 の有効範囲", () => {
    for (const it of items) {
      expect(it.paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(it.level[0]).toBeGreaterThanOrEqual(1);
      expect(it.level[1]).toBeLessThanOrEqual(6);
      expect(it.level[0]).toBeLessThanOrEqual(it.level[1]);
    }
  });
});
