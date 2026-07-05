import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { TTS_CACHE_DIR } from "./paths";
import type { SpawnFn } from "./stt";

const TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";

export type SynthesizeOpts = {
  voice?: string;
  apiKey?: string;
  cacheDir?: string;
  fetchFn?: typeof fetch;
  spawnFn?: SpawnFn;
};

export function cacheKeyFor(model: string, voice: string, text: string): string {
  return createHash("sha256").update(`${model}|${voice}|${text}`).digest("hex");
}

async function realSpawn(cmd: string[]): Promise<{ exitCode: number; stderr: string }> {
  const proc = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { exitCode, stderr };
}

async function synthesizeOpenAI(
  text: string, voice: string, apiKey: string, fetchFn: typeof fetch,
): Promise<Uint8Array> {
  const res = await fetchFn("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: TTS_MODEL, voice, input: text, response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS failed: ${res.status} ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function synthesizeSay(text: string, spawn: SpawnFn): Promise<Uint8Array> {
  const work = mkdtempSync(path.join(tmpdir(), "say-"));
  try {
    const aiff = path.join(work, "out.aiff");
    const mp3 = path.join(work, "out.mp3");
    const s = await spawn(["say", "-v", "Samantha", "-o", aiff, text]);
    if (s.exitCode !== 0) throw new Error(`say failed: ${s.stderr}`);
    const f = await spawn(["ffmpeg", "-i", aiff, mp3, "-y"]);
    if (f.exitCode !== 0) throw new Error(`ffmpeg failed: ${f.stderr}`);
    return new Uint8Array(await Bun.file(mp3).arrayBuffer());
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function synthesize(
  text: string, opts: SynthesizeOpts = {},
): Promise<{ audio: Uint8Array; mime: string; engine: "openai" | "say" }> {
  const voice = opts.voice ?? DEFAULT_VOICE;
  const apiKey = opts.apiKey ?? Bun.env.OPENAI_API_KEY;
  const cacheDir = opts.cacheDir ?? TTS_CACHE_DIR;
  mkdirSync(cacheDir, { recursive: true });

  if (apiKey) {
    const cachePath = path.join(cacheDir, `${cacheKeyFor(TTS_MODEL, voice, text)}.mp3`);
    if (existsSync(cachePath)) {
      return { audio: new Uint8Array(await Bun.file(cachePath).arrayBuffer()), mime: "audio/mpeg", engine: "openai" };
    }
    const audio = await synthesizeOpenAI(text, voice, apiKey, opts.fetchFn ?? fetch);
    await Bun.write(cachePath, audio);
    return { audio, mime: "audio/mpeg", engine: "openai" };
  }

  const audio = await synthesizeSay(text, opts.spawnFn ?? realSpawn);
  return { audio, mime: "audio/mpeg", engine: "say" };
}
