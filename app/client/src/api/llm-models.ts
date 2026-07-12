import { extractErrorMessage } from "./http";

/**
 * `GET /api/llm-models` のレスポンス型（サーバ providers/model-catalog.ts の CatalogModel/CatalogResult と同形）。
 * 実効モデルの可視化・選択 UI（用途タブ）が消費する。取得失敗は available:false + reason で表され、
 * throw にはならない（UI 側は「実体未確認」へ劣化するだけで、嘘の具体値を出さない）。
 */
export type CatalogModelEffort = { id: string; description?: string };
export type CatalogModelTier = { id: string; name: string; description?: string };

export type CatalogModel = {
  id: string;
  displayName: string;
  description: string;
  /** 'sonnet'→'claude-sonnet-5' のような canonical wire id（claude）／served model slug（codex）。実効モデル表示用。 */
  resolvedModel?: string;
  efforts?: CatalogModelEffort[];
  defaultEffort?: string;
  tiers?: CatalogModelTier[];
  defaultTier?: string;
  isDefault?: boolean;
};

export type CatalogResult = {
  available: boolean;
  reason?: string;
  models: CatalogModel[];
  fetchedAt: string;
};

export type LlmModelsResponse = { claude: CatalogResult; openai: CatalogResult; codex: CatalogResult; local: CatalogResult };

/** refresh=true で TTL キャッシュを無視した強制再取得を要求する（サーバは in-flight デデュープを持つ）。 */
export async function fetchLlmModels(refresh = false): Promise<LlmModelsResponse> {
  const res = await fetch(`/api/llm-models${refresh ? "?refresh=1" : ""}`);
  if (!res.ok) throw new Error(`llm-models failed: ${await extractErrorMessage(res)}`);
  return res.json();
}
