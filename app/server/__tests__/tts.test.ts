import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cacheKeyFor, synthesize } from "../tts";

/**
 * Bun.env.OPENAI_API_KEY を一時的に取り除いた状態で fn を実行し、
 * 実行結果に関わらず元の値へ復元する。
 * 「キー不在」の挙動を、実行環境に実キーが設定されていても再現できるようにする。
 */
async function withNoApiKey<T>(fn: () => Promise<T>): Promise<T> {
  const saved = Bun.env.OPENAI_API_KEY;
  delete Bun.env.OPENAI_API_KEY;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete Bun.env.OPENAI_API_KEY;
    else Bun.env.OPENAI_API_KEY = saved;
  }
}

// say / ffmpeg が生成するはずの出力ファイルを偽造する共通フェイク
// say: ["say","-v","Samantha","-o",<aiff>,"-f",<textFile>] → -o の次
// ffmpeg: ["ffmpeg","-i",<aiff>,<mp3>,"-y"] → 末尾 "-y" の1つ前
function makeFakeSpawn(spawned: string[][]) {
  return async (cmd: string[]) => {
    spawned.push(cmd);
    const oIdx = cmd.indexOf("-o");
    const out = oIdx >= 0 ? cmd[oIdx + 1] : cmd[cmd.length - 2];
    await Bun.write(out, new Uint8Array([9, 9]));
    return { exitCode: 0, stderr: "" };
  };
}

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
    await withNoApiKey(async () => {
      const cacheDir = mkdtempSync(path.join(tmpdir(), "tts-"));
      const spawned: string[][] = [];
      const r = await synthesize("Hello", { apiKey: undefined, cacheDir, spawnFn: makeFakeSpawn(spawned) });
      expect(r.engine).toBe("say");
      expect(spawned[0][0]).toBe("say");
      expect(spawned[1][0]).toBe("ffmpeg");
    });
  });

  test("OpenAI が実行時エラー（非200）でも say にフォールバックしてセッションを継続する", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "tts-"));
    const fakeFetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const spawned: string[][] = [];

    const r = await synthesize("Hello", {
      apiKey: "sk-test", cacheDir, fetchFn: fakeFetch, spawnFn: makeFakeSpawn(spawned),
    });
    expect(r.engine).toBe("say");
    expect(Array.from(r.audio)).toEqual([9, 9]);
    expect(spawned[0][0]).toBe("say");
  });

  test("OpenAI の fetch 自体が例外を投げても say にフォールバックする", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "tts-"));
    const fakeFetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    const spawned: string[][] = [];

    const r = await synthesize("Hello", {
      apiKey: "sk-test", cacheDir, fetchFn: fakeFetch, spawnFn: makeFakeSpawn(spawned),
    });
    expect(r.engine).toBe("say");
    expect(Array.from(r.audio)).toEqual([9, 9]);
  });

  test("OpenAI も say も失敗したら synthesize は reject する", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "tts-"));
    const fakeFetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const fakeSpawn = async (_cmd: string[]) => ({ exitCode: 1, stderr: "say not available" });

    await expect(
      synthesize("Hello", { apiKey: "sk-test", cacheDir, fetchFn: fakeFetch, spawnFn: fakeSpawn }),
    ).rejects.toThrow();
  });

  test("cacheDir がファイルでキャッシュ書き込みに失敗しても合成結果は返る", async () => {
    const parent = mkdtempSync(path.join(tmpdir(), "tts-"));
    const cacheDirAsFile = path.join(parent, "not-a-dir");
    await Bun.write(cacheDirAsFile, "im a file, not a directory");
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      return new Response(new Uint8Array([4, 2, 0]), { status: 200 });
    }) as typeof fetch;

    const r = await synthesize("Cache write failure text", {
      apiKey: "sk-test", cacheDir: cacheDirAsFile, fetchFn: fakeFetch,
    });
    expect(r.engine).toBe("openai");
    expect(Array.from(r.audio)).toEqual([4, 2, 0]);
    expect(calls).toBe(1);
  });

  test("say 実行時、先頭が「-」のテキストも argv に直接渡らずファイル経由になる（引数インジェクション対策）", async () => {
    await withNoApiKey(async () => {
      const cacheDir = mkdtempSync(path.join(tmpdir(), "tts-"));
      const text = "- dash leading text";
      const spawned: string[][] = [];
      const fakeSpawn = async (cmd: string[]) => {
        spawned.push(cmd);
        if (cmd[0] === "say") {
          const fIdx = cmd.indexOf("-f");
          expect(fIdx).toBeGreaterThanOrEqual(0);
          const textFile = cmd[fIdx + 1];
          expect(readFileSync(textFile, "utf8")).toBe(text);
        }
        const oIdx = cmd.indexOf("-o");
        const out = oIdx >= 0 ? cmd[oIdx + 1] : cmd[cmd.length - 2];
        await Bun.write(out, new Uint8Array([1]));
        return { exitCode: 0, stderr: "" };
      };

      const r = await synthesize(text, { apiKey: undefined, cacheDir, spawnFn: fakeSpawn });
      expect(r.engine).toBe("say");
      for (const arg of spawned[0]) {
        expect(arg).not.toBe(text);
      }
    });
  });
});
