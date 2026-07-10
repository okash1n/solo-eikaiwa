import { describe, expect, test } from "bun:test";
import { countDueByYmd } from "./practice-summary";

describe("countDueByYmd", () => {
  test("例文とチャンクを同じdue基準で合算する", () => {
    const sentences = [
      { srs: { due: "2026-07-10" } },
      { srs: { due: "2026-07-12" } },
      { srs: null },
    ];
    const chunks = [
      { srs: { due: "2026-07-11" } },
      { srs: { due: "2026-07-15" } },
    ];
    expect(countDueByYmd([...sentences, ...chunks], "2026-07-11")).toBe(2);
  });

  test("空配列は0件", () => {
    expect(countDueByYmd([], "2026-07-11")).toBe(0);
  });
});
