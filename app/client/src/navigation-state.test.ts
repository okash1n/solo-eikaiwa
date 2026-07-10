import { describe, expect, test } from "bun:test";
import { isHomeNavigationActive } from "./navigation-state";

describe("ホームのナビゲーション状態", () => {
  test("ホームとホームから開始したセッションではホームを現在地として示す", () => {
    expect(isHomeNavigationActive("start")).toBe(true);
    expect(isHomeNavigationActive("session")).toBe(true);
  });

  test("独立画面ではホームを現在地にしない", () => {
    expect(isHomeNavigationActive("free")).toBe(false);
    expect(isHomeNavigationActive("about")).toBe(false);
  });
});
