import { describe, expect, test } from "bun:test";
import { appendTurn, resolveSessionId, TranscriptStore, type ChatTurn } from "../providers/transcript";

describe("transcript helpers", () => {
  test("resolveSessionId: 既知IDはそのまま・未知/未指定は新UUID", () => {
    const store = new Map<string, ChatTurn[]>([["s1", []]]);
    expect(resolveSessionId(store, "s1")).toBe("s1");
    const fresh = resolveSessionId(store, "unknown");
    expect(fresh).not.toBe("unknown");
    expect(fresh).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveSessionId(store, undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
  test("appendTurn: 1往復を追記し既存履歴を保持", () => {
    const store = new Map<string, ChatTurn[]>();
    appendTurn(store, "s1", "hi", "hello");
    appendTurn(store, "s1", "how are you", "fine");
    expect(store.get("s1")).toEqual([
      { role: "user", content: "hi" }, { role: "assistant", content: "hello" },
      { role: "user", content: "how are you" }, { role: "assistant", content: "fine" },
    ]);
  });

  test("1 sessionをturn数と推定token数で切り詰め、rotation必要を記録する", () => {
    const store = new TranscriptStore({
      maxTurns: 2,
      maxTokens: 16,
      maxSessions: 10,
      ttlMs: 1_000,
      estimateTokens: (text) => text.length,
    });
    appendTurn(store, "s1", "u1", "a1");
    appendTurn(store, "s1", "u222", "a222");
    appendTurn(store, "s1", "u333", "a333");
    const history = store.get("s1")!;
    expect(history).toEqual([
      { role: "user", content: "u222" }, { role: "assistant", content: "a222" },
      { role: "user", content: "u333" }, { role: "assistant", content: "a333" },
    ]);
    expect(store.tokenCount("s1")).toBeLessThanOrEqual(16);
    expect(store.needsRotation("s1")).toBe(true);
  });

  test("単一往復がtoken上限を超えても保存contextを上限内へ切り詰める", () => {
    const store = new TranscriptStore({
      maxTurns: 2,
      maxTokens: 6,
      maxSessions: 10,
      ttlMs: 1_000,
      estimateTokens: (text) => text.length,
    });
    appendTurn(store, "s1", "abcdefgh", "ijklmnop");
    expect(store.tokenCount("s1")).toBeLessThanOrEqual(6);
    expect(store.get("s1")).toHaveLength(2);
  });

  test("session数をLRUで制限し、アクセスされたsessionを残す", () => {
    const store = new TranscriptStore({ maxTurns: 2, maxTokens: 100, maxSessions: 2, ttlMs: 1_000 });
    appendTurn(store, "s1", "u1", "a1");
    appendTurn(store, "s2", "u2", "a2");
    store.get("s1");
    appendTurn(store, "s3", "u3", "a3");
    expect(store.has("s1")).toBe(true);
    expect(store.has("s2")).toBe(false);
    expect(store.has("s3")).toBe(true);
    expect(store.wasEvicted("s2")).toBe(true);
  });

  test("TTLと明示終了で履歴を回収する", () => {
    let now = 0;
    const store = new TranscriptStore({
      maxTurns: 2, maxTokens: 100, maxSessions: 2, ttlMs: 100, now: () => now,
    });
    appendTurn(store, "ttl", "u", "a");
    now = 101;
    expect(store.has("ttl")).toBe(false);
    appendTurn(store, "ended", "u", "a");
    store.end("ended");
    expect(store.has("ended")).toBe(false);
    expect(store.wasEvicted("ended")).toBe(true);
  });

  test("長時間・多数sessionでも保存session数と各prompt量を上限内に保つ", () => {
    const store = new TranscriptStore({
      maxTurns: 3,
      maxTokens: 80,
      maxSessions: 8,
      ttlMs: 60_000,
      estimateTokens: (text) => text.length,
    });
    for (let session = 0; session < 200; session++) {
      for (let turn = 0; turn < 50; turn++) {
        appendTurn(store, `s${session}`, `user-${turn}`, `assistant-${turn}`);
      }
    }

    expect(store.size).toBe(8);
    for (let session = 192; session < 200; session++) {
      expect(store.get(`s${session}`)?.length).toBeLessThanOrEqual(6);
      expect(store.tokenCount(`s${session}`)).toBeLessThanOrEqual(80);
    }
    expect(store.has("s0")).toBe(false);
  });
});
