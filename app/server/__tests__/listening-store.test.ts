import { describe, expect, test } from "bun:test";
import { openDb } from "../db";
import { makeListeningStore } from "../listening-store";

function memStore() {
  return makeListeningStore(openDb(":memory:"));
}

describe("listening-store", () => {
  test("log して countSince で数えられる（スキーマ自動作成・採番）", () => {
    const store = memStore();
    const row = store.log("item-a", "2026-07-07");
    expect(typeof row.id).toBe("number");
    expect(row.itemId).toBe("item-a");
    expect(row.ymd).toBe("2026-07-07");
    expect(row.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(store.countSince("2026-07-01")).toBe(1);
  });

  test("countSince は fromYmd を含み、それ以前を除外する", () => {
    const store = memStore();
    store.log("a", "2026-06-30"); // 窓の外
    store.log("b", "2026-07-01"); // 境界（含む）
    store.log("c", "2026-07-05");
    expect(store.countSince("2026-07-01")).toBe(2);
  });

  test("同一素材の複数聴取もすべて数える（回数カウントであり distinct ではない）", () => {
    const store = memStore();
    store.log("a", "2026-07-07");
    store.log("a", "2026-07-07");
    expect(store.countSince("2026-07-01")).toBe(2);
  });
});
