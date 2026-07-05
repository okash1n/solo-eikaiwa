export type Health = {
  ok: boolean; whisper: boolean; ffmpeg: boolean; claude: boolean; ttsKey: boolean; modelFile: boolean;
};

/**
 * 非2xxレスポンスからエラーメッセージを取り出す。サーバ停止時にプロキシ/ブラウザが
 * 返すHTMLなど非JSONボディでも例外を投げず、`HTTP <status>` にフォールバックする。
 */
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // 非JSONボディ（サーバ停止時のエラーページ等）はフォールバックメッセージを使う
  }
  return `HTTP ${res.status}`;
}

export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  return res.json();
}

export async function sttUpload(blob: Blob): Promise<string> {
  const res = await fetch("/api/stt", {
    method: "POST",
    headers: { "content-type": blob.type || "audio/webm" },
    body: blob,
  });
  if (!res.ok) throw new Error(`STT failed: ${await extractErrorMessage(res)}`);
  return (await res.json()).text as string;
}

export async function converse(
  userText: string,
  sessionId?: string,
  scenarioId?: string,
): Promise<{ replyText: string; sessionId: string }> {
  const res = await fetch("/api/converse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userText, sessionId, scenarioId }),
  });
  if (!res.ok) throw new Error(`converse failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export async function ttsFetch(text: string): Promise<Blob> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${await extractErrorMessage(res)}`);
  return res.blob();
}

/**
 * sessionId はアプリ起動時に mint するクライアント側セッションUUID（省略可・後方互換）。
 * converse() が返す会話用 sessionId とは別概念で、ライフサイクル/ブロック/ラウンドイベントの突合に使う。
 */
export async function sessionStart(sessionId?: string): Promise<void> {
  await fetch("/api/session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

export async function sessionEnd(sessionId: string): Promise<void> {
  await fetch("/api/session/end", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}

/**
 * タブを閉じる/リロード時にも session_end を届けるための keepalive 送信。
 * pagehide からの呼び出し想定なので await しない（fire-and-forget）。
 */
export function sessionEndKeepalive(sessionId: string): void {
  void fetch("/api/session/end", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
    keepalive: true,
  }).catch(() => {});
}

export type ContentItem = { id: string; kind: "topic" | "scenario"; title: string; titleJa: string; hints: string[] };
export type MenuBlock = { id: string; kind: string; title: string; minutes: number; params: { topic?: ContentItem; scenario?: ContentItem; roundsSec?: number[] } };
export type Menu = { minutes: number; date: string; blocks: MenuBlock[] };
export type AeItem = { quote: string; issue: string; better: string; why_ja: string };
export type AeFeedback = { items: AeItem[]; praise: string };
export type Reflection = { goodPhrases: string[]; fixes: Array<{ original: string; better: string }>; noteForTomorrow_ja: string };
export type PrepPack = { chunks: Array<{ en: string; ja: string }>; outline: string[] };

export async function fetchMenu(minutes: 60 | 30): Promise<Menu> {
  const res = await fetch(`/api/menu/today?minutes=${minutes}`);
  if (!res.ok) throw new Error(`menu failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export async function fetchAeFeedback(transcript: string, topicTitle: string): Promise<AeFeedback> {
  const res = await fetch("/api/feedback/ae", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcript, topicTitle }),
  });
  if (!res.ok) throw new Error(`AE feedback failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export async function fetchModelTalk(topicId: string): Promise<string> {
  const res = await fetch("/api/coach/model-talk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topicId }),
  });
  if (!res.ok) throw new Error(`model talk failed: ${await extractErrorMessage(res)}`);
  return ((await res.json()) as { text: string }).text;
}

export async function fetchReflection(): Promise<Reflection> {
  const res = await fetch("/api/coach/reflection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`reflection failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

/**
 * トピックID→PrepPack のセッション内キャッシュ（進行中Promise共有）。音読ウォームアップと4/3/2準備フェーズが
 * 同じトピックのパックを要求するため、Claude呼び出しをセッションあたり1回に抑える。
 * 失敗時は削除して再試行可能。
 */
const prepPackCache = new Map<string, Promise<PrepPack>>();

export async function fetchPrepPack(topicId: string): Promise<PrepPack> {
  let p = prepPackCache.get(topicId);
  if (!p) {
    p = (async () => {
      const res = await fetch("/api/coach/prep", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topicId }),
      });
      if (!res.ok) throw new Error(`prep failed: ${await extractErrorMessage(res)}`);
      return (await res.json()) as PrepPack;
    })();
    p.catch(() => prepPackCache.delete(topicId));
    prepPackCache.set(topicId, p);
  }
  return p;
}

export function sendSessionEvent(
  type: "block_start" | "block_end" | "round_start" | "round_end",
  sessionId: string | undefined,
  meta?: Record<string, unknown>,
): void {
  // 進行イベントは fire-and-forget（記録失敗でセッションを止めない）
  void fetch("/api/session/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, sessionId, meta }),
  }).catch(() => {});
}

export type QuickDrillKind = "warmup" | "ftt-mini" | "roleplay" | "shadowing";

export async function fetchQuickMenu(kind: QuickDrillKind): Promise<Menu> {
  const res = await fetch(`/api/menu/quick?kind=${kind}`);
  if (!res.ok) throw new Error(`quick menu failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export async function fetchPracticeDays(): Promise<string[]> {
  const res = await fetch("/api/progress/days");
  if (!res.ok) throw new Error(`practice days failed: ${await extractErrorMessage(res)}`);
  return ((await res.json()) as { days: string[] }).days;
}

export type Settings = { anchor: string };

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`settings failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export async function saveSettings(s: Settings): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error(`settings save failed: ${await extractErrorMessage(res)}`);
}
