import { describe, expect, spyOn, test } from "bun:test";
import { withTimeout, withFallback } from "../providers/decorators";
import { TransportError } from "../providers/errors";
import type { ClaudeRunner } from "../converse";

describe("withTimeout", () => {
  test("期限内はそのまま解決し、超過時は TransportError で reject する", async () => {
    const slow: ClaudeRunner = () =>
      new Promise((r) => setTimeout(() => r({ text: "ok", sessionId: "s" }), 50));

    await expect(withTimeout(slow, 1000)("x")).resolves.toEqual({ text: "ok", sessionId: "s" });
    await expect(withTimeout(slow, 10)("x")).rejects.toBeInstanceOf(TransportError);
  });

  test("解決後にタイマーが必ず clear される（setTimeout/clearTimeout をモックして検証）", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    let capturedId: ReturnType<typeof setTimeout> | undefined;
    const clearedIds: unknown[] = [];

    // @ts-expect-error: テスト用に一時的にグローバルの型を緩めてラップする
    globalThis.setTimeout = (fn: (...args: unknown[]) => void, ms?: number) => {
      capturedId = originalSetTimeout(fn, ms);
      return capturedId;
    };
    globalThis.clearTimeout = (id: unknown) => {
      clearedIds.push(id);
      return originalClearTimeout(id as Parameters<typeof clearTimeout>[0]);
    };

    try {
      const fast: ClaudeRunner = () => Promise.resolve({ text: "ok", sessionId: "s" });
      await withTimeout(fast, 1000)("x");
      expect(capturedId).toBeDefined();
      expect(clearedIds).toContain(capturedId);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});

describe("withFallback", () => {
  test("primary が TransportError で reject したら、同一引数で fallback に委譲し warn する", async () => {
    const calls: unknown[][] = [];
    const primary: ClaudeRunner = async () => { throw new TransportError("primary down"); };
    const fallback: ClaudeRunner = async (...args) => {
      calls.push(args);
      return { text: "fallback-result", sessionId: "fb" };
    };
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await withFallback(primary, fallback)("hi", "resume-1", { systemPrompt: "SP" });
      expect(res).toEqual({ text: "fallback-result", sessionId: "fb" });
      expect(calls).toEqual([["hi", "resume-1", { systemPrompt: "SP" }]]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toBe("primary runner unavailable, falling back:");
    } finally {
      warn.mockRestore();
    }
  });

  test("primary が plain Error で reject したら fallback を呼ばずそのまま rethrow する", async () => {
    const plain = new Error("model exploded");
    const primary: ClaudeRunner = async () => { throw plain; };
    const fallback: ClaudeRunner = async () => {
      throw new Error("fallback should not be called");
    };
    await expect(withFallback(primary, fallback)("hi")).rejects.toBe(plain);
  });

  test("primary が解決すれば fallback は呼ばれず primary の結果がそのまま返る", async () => {
    let fallbackCalled = false;
    const primary: ClaudeRunner = async () => ({ text: "primary-ok", sessionId: "p" });
    const fallback: ClaudeRunner = async () => {
      fallbackCalled = true;
      return { text: "should not happen", sessionId: "fb" };
    };
    const res = await withFallback(primary, fallback)("hi");
    expect(res).toEqual({ text: "primary-ok", sessionId: "p" });
    expect(fallbackCalled).toBe(false);
  });

  test("primary の reject 処理中に unhandled rejection を発生させない（reject を確実に catch 済みにする）", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const primary: ClaudeRunner = () => Promise.reject(new TransportError("boom"));
      const fallback: ClaudeRunner = async () => ({ text: "ok", sessionId: "fb" });
      const warn = spyOn(console, "warn").mockImplementation(() => {});
      try {
        await withFallback(primary, fallback)("hi");
      } finally {
        warn.mockRestore();
      }
      // マイクロタスクキューを1周させ、unhandledRejection が非同期に発火する余地を与える
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
