import { extractErrorMessage } from "./http";
import { invalidateTtsCaches } from "./tts";

/** UI から設定できる API キー（サーバの KEYCHAIN_SECRET_NAMES と一致・binding）。 */
export type SecretName = "ANTHROPIC_API_KEY" | "CODEX_API_KEY" | "OPENAI_API_KEY" | "OPENAI_COMPAT_API_KEY" | "TTS_API_KEY";

/** 鍵の有無とソース。値はサーバがいかなる応答にも含めない（write-only API）。 */
export type SecretStatus = { configured: boolean; source: "keychain" | "env" | "legacy" | null };
export type SecretsView = Record<SecretName, SecretStatus>;

/**
 * 専用 OPENAI_API_KEY 未設定でも、旧版の公式URL束縛キーが実行時に有効なら移行元として示す。
 * OPENAI_API_KEY 自身の Keychain/env 状態は常に優先する。
 */
export function effectiveSecretsView(view: SecretsView, legacyOpenAiKeyConfigured: boolean): SecretsView;
export function effectiveSecretsView(view: null, legacyOpenAiKeyConfigured: boolean): null;
export function effectiveSecretsView(view: SecretsView | null, legacyOpenAiKeyConfigured: boolean): SecretsView | null;
export function effectiveSecretsView(view: SecretsView | null, legacyOpenAiKeyConfigured: boolean): SecretsView | null {
  if (!view || view.OPENAI_API_KEY.configured || !legacyOpenAiKeyConfigured) return view;
  return { ...view, OPENAI_API_KEY: { configured: true, source: "legacy" } };
}

export async function fetchSecrets(): Promise<SecretsView> {
  const res = await fetch("/api/secrets");
  if (!res.ok) throw new Error(`secrets failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

/** PUT/DELETE 応答。applied:false は「保存はされたが実行中プロセスへの適用に失敗」（error に理由）。 */
export type SecretMutationResult = { secrets: SecretsView; applied: boolean; error: string | null };

export async function saveSecret(name: SecretName, value: string, baseUrl?: string): Promise<SecretMutationResult> {
  const res = await fetch("/api/secrets", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, value, ...(baseUrl !== undefined ? { baseUrl } : {}) }),
  });
  if (!res.ok) throw new Error(`secret save failed: ${await extractErrorMessage(res)}`);
  if (name === "TTS_API_KEY") invalidateTtsCaches();
  return res.json();
}

export async function deleteSecret(name: SecretName): Promise<SecretMutationResult> {
  const res = await fetch(`/api/secrets/${name}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`secret delete failed: ${await extractErrorMessage(res)}`);
  if (name === "TTS_API_KEY") invalidateTtsCaches();
  return res.json();
}
