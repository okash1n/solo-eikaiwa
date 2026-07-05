import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { converseTurn } from "../converse";
import { readEvents } from "../session-log";

describe("converse", () => {
  test("初回ターン: resume無しで runner を呼び、2イベントをログし、sessionId を返す", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "conv-"));
    const logFile = path.join(dir, "log.jsonl");
    const calls: Array<{ prompt: string; resumeId?: string }> = [];
    const fakeRunner = async (prompt: string, resumeId?: string) => {
      calls.push({ prompt, resumeId });
      return { text: "Nice to meet you!", sessionId: "claude-sess-1" };
    };

    const r = await converseTurn({ userText: "Hi, I am Shin.", runner: fakeRunner, logFile });

    expect(r.replyText).toBe("Nice to meet you!");
    expect(r.sessionId).toBe("claude-sess-1");
    expect(calls[0].resumeId).toBeUndefined();
    expect(calls[0].prompt).toContain("Hi, I am Shin.");

    const events = readEvents(logFile);
    expect(events.map((e) => e.type)).toEqual(["user_utterance", "assistant_reply"]);
    expect(events[1].text).toBe("Nice to meet you!");
  });

  test("2ターン目: 前回の sessionId を resume として渡す", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "conv-"));
    const logFile = path.join(dir, "log.jsonl");
    const calls: Array<{ resumeId?: string }> = [];
    const fakeRunner = async (_prompt: string, resumeId?: string) => {
      calls.push({ resumeId });
      return { text: "ok", sessionId: "claude-sess-1" };
    };

    await converseTurn({ userText: "second turn", sessionId: "claude-sess-1", runner: fakeRunner, logFile });
    expect(calls[0].resumeId).toBe("claude-sess-1");
  });
});
