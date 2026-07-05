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

export async function converse(userText: string, sessionId?: string): Promise<{ replyText: string; sessionId: string }> {
  const res = await fetch("/api/converse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userText, sessionId }),
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

export async function sessionStart(): Promise<void> {
  await fetch("/api/session/start", { method: "POST" });
}

export async function sessionEnd(sessionId: string): Promise<void> {
  await fetch("/api/session/end", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
}
