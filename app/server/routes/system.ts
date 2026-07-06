import path from "node:path";
import { mkdirSync } from "node:fs";
import { localYmd } from "../dates";
import { RECORDINGS_DIR } from "../paths";
import { appendEvent } from "../session-log";
import { transcribeAudio } from "../stt";
import { synthesize } from "../tts";
import { checkHealth } from "../health";
import { computeUtteranceMetrics, type UtteranceMetrics } from "../metrics";
import { json, parseJsonBody, exact, bestEffort, type RouteEntry } from "./http";

export type SystemRoutesDeps = {
  health: () => ReturnType<typeof checkHealth>;
  transcribe: typeof transcribeAudio;
  synthesize: typeof synthesize;
  logFile: () => string;
  /** 省略時は実データディレクトリ（RECORDINGS_DIR）を使う。テストでは temp dir を注入する。 */
  recordingsDir?: string;
};

async function handleStt(req: Request, deps: SystemRoutesDeps): Promise<Response> {
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) return json({ error: "empty audio body" }, 400);
  const day = localYmd();
  const dir = path.join(deps.recordingsDir ?? RECORDINGS_DIR, day);
  mkdirSync(dir, { recursive: true });
  const ext = (req.headers.get("content-type") ?? "").includes("wav") ? "wav" : "webm";
  const file = path.join(dir, `${Date.now()}.${ext}`);
  await Bun.write(file, bytes);
  const { text, segments } = await deps.transcribe(file);
  // メトリクスは補助情報 — 計算・記録の失敗で文字起こし自体を失敗させない
  let metrics: UtteranceMetrics | undefined;
  bestEffort("[metrics] compute/record failed, continuing:", () => {
    const m = computeUtteranceMetrics(segments);
    appendEvent(deps.logFile(), {
      ts: new Date().toISOString(), type: "stt_result", sessionId: "stt", text, meta: { metrics: m },
    });
    metrics = m;
  });
  return json(metrics ? { text, metrics } : { text });
}

async function handleTts(req: Request, deps: SystemRoutesDeps): Promise<Response> {
  const parsed = await parseJsonBody<{ text?: string; voice?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body.text?.trim()) return json({ error: "text is required" }, 400);
  const { audio, mime, engine } = await deps.synthesize(body.text, { voice: body.voice });
  return new Response(audio as unknown as BodyInit, { headers: { "content-type": mime, "x-tts-engine": engine } });
}

export function makeSystemRoutes(deps: SystemRoutesDeps): RouteEntry[] {
  return [
    exact("GET", "/api/health", () => json(deps.health())),
    exact("POST", "/api/stt", (req) => handleStt(req, deps)),
    exact("POST", "/api/tts", (req) => handleTts(req, deps)),
  ];
}
