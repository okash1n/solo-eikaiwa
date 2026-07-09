import path from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { MODELS_DIR } from "./paths";
import { realSpawn, type SpawnFn } from "./spawn";
import type { WhichFn } from "./health";
export type { SpawnFn } from "./spawn";

export const WHISPER_MODEL_PATH = path.join(MODELS_DIR, "ggml-large-v3-turbo.bin");

export function buildWhisperArgs(modelPath: string, wavPath: string, outBase: string): string[] {
  return ["-m", modelPath, "-f", wavPath, "-l", "en", "-oj", "-of", outBase, "-np"];
}

export type SttSegment = { fromMs: number; toMs: number; text: string };
export type Transcription = { text: string; segments: SttSegment[] };

export function parseWhisperJson(jsonText: string): Transcription {
  const data = JSON.parse(jsonText) as {
    transcription?: Array<{ text: string; offsets?: { from?: number; to?: number } }>;
  };
  if (!data.transcription) return { text: "", segments: [] };
  const segments: SttSegment[] = data.transcription.map((s) => ({
    fromMs: typeof s.offsets?.from === "number" ? s.offsets.from : 0,
    toMs: typeof s.offsets?.to === "number" ? s.offsets.to : 0,
    text: s.text,
  }));
  return { text: segments.map((s) => s.text).join("").trim(), segments };
}

function whisperBin(): string {
  return Bun.which("whisper-cli") ?? Bun.which("whisper-cpp") ?? "whisper-cli";
}

/** アップロードされた録音の実コンテナ種別。afconvert/ffmpeg のどちらが使えるかの判定に使う。 */
export type AudioContainer = "webm" | "mp4" | "mp3" | "wav" | "unknown";

/**
 * content-type ヘッダを優先し、無い/汎用値のときのみ先頭バイトのマジックナンバーで判定する。
 * Tauri（WKWebView）の MediaRecorder は audio/mp4 を録音できるが、環境によって Content-Type が
 * 省略・汎用化されるケースを想定した保険。
 */
export function detectAudioContainer(contentType: string | null, bytes: Uint8Array): AudioContainer {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("webm")) return "webm";
  if (ct.includes("wav")) return "wav";
  if (ct.includes("mp4") || ct.includes("m4a")) return "mp4";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";

  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return "mp4"; // ISO BMFF の `ftyp` ボックス（mp4/m4a 共通）
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "webm"; // EBML ヘッダ
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "wav"; // RIFF....WAVE
  }
  if (
    (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || // ID3タグ付きmp3
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) // MPEGフレーム同期
  ) {
    return "mp3";
  }
  return "unknown";
}

export type Converter = "ffmpeg" | "afconvert";

/**
 * この環境で使える変換器が無い（= ffmpeg 未導入 かつ afconvert非対応コンテナ）ことを表すエラー。
 * ルート側で 400 に変換し、ユーザーに「mp4 録音が必要」であることを明示する。
 */
export class UnsupportedAudioContainerError extends Error {
  constructor(container: AudioContainer) {
    super(
      `この環境では mp4 録音が必要です（ffmpeg が見つからず、${container} は変換できません）。` +
      ` / This environment requires mp4 recording (ffmpeg not found; cannot convert "${container}").`,
    );
    this.name = "UnsupportedAudioContainerError";
  }
}

/**
 * ffmpeg が使えれば従来どおり ffmpeg（全コンテナ対応）。無ければ afconvert
 * （macOS 標準搭載・mp4/m4a/mp3 のみ対応、webm は変換不可）。どちらも使えなければ null。
 */
export function selectConverter(container: AudioContainer, opts: { whichFn?: WhichFn } = {}): Converter | null {
  const which = opts.whichFn ?? ((b: string) => Bun.which(b));
  if (which("ffmpeg")) return "ffmpeg";
  if (container === "mp4" || container === "mp3") return "afconvert";
  return null;
}

/** 入力音声（webm/wav/mp4/mp3等）を 16kHz mono WAV に変換して whisper で文字起こしする */
export async function transcribeAudio(
  inputPath: string,
  opts: { spawnFn?: SpawnFn; whichFn?: WhichFn; container?: AudioContainer } = {},
): Promise<Transcription> {
  const spawn = opts.spawnFn ?? realSpawn;
  // container 省略時はブラウザ録音（webm）を仮定する既存前提を維持（呼び出し元は routes/system.ts が
  // 常に実コンテナを渡す。省略できるのは主にテストの後方互換のため）。
  const container = opts.container ?? "webm";
  const converter = selectConverter(container, { whichFn: opts.whichFn });
  if (!converter) throw new UnsupportedAudioContainerError(container);

  const work = mkdtempSync(path.join(tmpdir(), "stt-"));
  try {
    const wavPath = path.join(work, "in.wav");
    const conv = converter === "ffmpeg"
      ? await spawn(["ffmpeg", "-i", inputPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath, "-y"])
      : await spawn(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", inputPath, wavPath]);
    if (conv.exitCode !== 0) throw new Error(`${converter} failed: ${conv.stderr.slice(-500)}`);

    const outBase = path.join(work, "out");
    const wh = await spawn([whisperBin(), ...buildWhisperArgs(WHISPER_MODEL_PATH, wavPath, outBase)]);
    if (wh.exitCode !== 0) throw new Error(`whisper failed: ${wh.stderr.slice(-500)}`);

    return parseWhisperJson(readFileSync(`${outBase}.json`, "utf8"));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
