import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cacheKeyFor, synthesize } from "../tts";

describe("tts", () => {
  test("cacheKeyFor は model/voice/text で決まる64桁hex", () => {
    const k1 = cacheKeyFor("gpt-4o-mini-tts", "alloy", "Hello");
    const k2 = cacheKeyFor("gpt-4o-mini-tts", "alloy", "Hello");
    const k3 = cacheKeyFor("gpt-4o-mini-tts", "nova", "Hello");
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("APIキーがあれば OpenAI を呼び、2回目はキャッシュを使う", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "tts-"));
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }) as typeof fetch;

    const r1 = await synthesize("Hello there", { apiKey: "sk-test", cacheDir, fetchFn: fakeFetch });
    const r2 = await synthesize("Hello there", { apiKey: "sk-test", cacheDir, fetchFn: fakeFetch });
    expect(calls).toBe(1);
    expect(r1.engine).toBe("openai");
    expect(r1.mime).toBe("audio/mpeg");
    expect(Array.from(r2.audio)).toEqual([1, 2, 3]);
    expect(readdirSync(cacheDir)).toHaveLength(1);
  });

  test("APIキーが無ければ say フォールバックで生成する", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "tts-"));
    const spawned: string[][] = [];
    const fakeSpawn = async (cmd: string[]) => {
      spawned.push(cmd);
      // say / ffmpeg が生成するはずの出力ファイルを偽造
      // say: ["say","-v","Samantha","-o",<aiff>,<text>] → -o の次
      // ffmpeg: ["ffmpeg","-i",<aiff>,<mp3>,"-y"] → 末尾 "-y" の1つ前
      const oIdx = cmd.indexOf("-o");
      const out = oIdx >= 0 ? cmd[oIdx + 1] : cmd[cmd.length - 2];
      await Bun.write(out, new Uint8Array([9, 9]));
      return { exitCode: 0, stderr: "" };
    };
    const r = await synthesize("Hello", { apiKey: undefined, cacheDir, spawnFn: fakeSpawn });
    expect(r.engine).toBe("say");
    expect(spawned[0][0]).toBe("say");
    expect(spawned[1][0]).toBe("ffmpeg");
  });
});
