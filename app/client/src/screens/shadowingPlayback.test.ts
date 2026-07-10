import { describe, expect, test } from "bun:test";
import { resolveShadowingPlaybackOutcome } from "./shadowingPlayback";

describe("resolveShadowingPlaybackOutcome", () => {
  test("最後まで聞けたときだけ有効な練習として扱う", () => {
    expect(resolveShadowingPlaybackOutcome("completed")).toEqual({
      nextState: "ready", validAttempt: true, showRetry: false,
    });
  });

  test("停止時は待機に戻り、失敗案内を出さない", () => {
    expect(resolveShadowingPlaybackOutcome("stopped")).toEqual({
      nextState: "ready", validAttempt: false, showRetry: false,
    });
  });

  test("失敗時はキャッシュ済み音声を再試行できる待機状態に戻す", () => {
    expect(resolveShadowingPlaybackOutcome("failed")).toEqual({
      nextState: "ready", validAttempt: false, showRetry: true,
    });
  });
});
