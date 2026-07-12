import { parseRemoteBaseUrl } from "./remote-endpoint";

/** OpenAI 公式 API の固定接続先。利用者入力の Base URL とは分離する。 */
export const OPENAI_BASE_URL = "https://api.openai.com/v1";

/** 旧 OpenAI 互換設定が実際には公式 API を指していたかを安全に判定する。 */
export function isOfficialOpenAiBaseUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const parsed = parseRemoteBaseUrl(value);
  return parsed.ok && parsed.baseUrl === OPENAI_BASE_URL;
}
