/**
 * TTS エンジン「自動」が現在どちらに解決されるかの表示用純関数。
 * サーバ `app/server/tts.ts` の暗黙決定と同一規則（binding）:
 * APIキーがある、または Base URL が既定以外（非空）なら HTTP、それ以外は macOS say。
 * baseUrl は編集中の入力値を渡す（保存前でもラベルがライブに現在の解決先を示す＝UI 真実性）。
 */
export function ttsAutoResolution(
  apiKeyConfigured: boolean,
  baseUrl: string,
  defaultBaseUrl: string,
): "say" | "openai-compat" {
  const trimmed = baseUrl.trim();
  const isCustomEndpoint = trimmed.length > 0 && trimmed !== defaultBaseUrl;
  return apiKeyConfigured || isCustomEndpoint ? "openai-compat" : "say";
}
