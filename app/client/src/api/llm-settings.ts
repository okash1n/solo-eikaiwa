import { extractErrorMessage } from "./http";

export type LlmProvider = "env" | "claude" | "openai-compat" | "codex";

/** GET/PUT 応答。APIキー値は含まれない（有無のみ apiKeyConfigured）。 */
export type LlmSettingsView = {
  provider: LlmProvider;
  baseUrl: string | null;
  model: string | null;
  codexModel: string | null;
  apiKeyConfigured: boolean;
  envProvider: string;
  /** PUT 応答のみ: 実行中プロセスへ適用できたか */
  applied?: boolean;
  /** PUT 応答のみ: 適用失敗時のメッセージ */
  error?: string | null;
};

export type LlmSettingsInput = {
  provider: LlmProvider;
  baseUrl?: string | null;
  model?: string | null;
  codexModel?: string | null;
};

export async function fetchLlmSettings(): Promise<LlmSettingsView> {
  const res = await fetch("/api/llm-settings");
  if (!res.ok) throw new Error(`llm-settings failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export async function saveLlmSettings(input: LlmSettingsInput): Promise<LlmSettingsView> {
  const res = await fetch("/api/llm-settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`llm-settings save failed: ${await extractErrorMessage(res)}`);
  return res.json();
}
