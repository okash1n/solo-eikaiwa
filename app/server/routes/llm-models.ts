import { json, exact, type RouteEntry } from "./http";
import type { CatalogResult, LlmCatalogProvider } from "../providers/model-catalog";
import type { AppDistribution } from "../distribution";

export type LlmModelsRoutesDeps = {
  getDistribution?: () => AppDistribution;
  /** provider 別のモデルカタログを返す（TTL キャッシュ・劣化パスは providers/model-catalog.ts が担う）。 */
  getModelCatalog: (provider: LlmCatalogProvider, refresh: boolean) => Promise<CatalogResult>;
};

/** ルートは薄く保つ: refresh クエリを読み取り、4ソースを並行取得して合成するだけ。HTTP は常に 200。 */
export function makeLlmModelsRoutes(deps: LlmModelsRoutesDeps): RouteEntry[] {
  return [
    exact("GET", "/api/llm-models", async (_req, url) => {
      const refresh = url.searchParams.get("refresh") === "1";
      const unavailable = (): CatalogResult => ({
        available: false,
        reason: "This provider is unavailable in the Mac App Store build",
        models: [],
        fetchedAt: new Date().toISOString(),
      });
      const appStore = deps.getDistribution?.() === "app-store";
      const [claude, openai, codex, local] = await Promise.all([
        appStore ? Promise.resolve(unavailable()) : deps.getModelCatalog("claude", refresh),
        deps.getModelCatalog("openai", refresh),
        appStore ? Promise.resolve(unavailable()) : deps.getModelCatalog("codex", refresh),
        deps.getModelCatalog("local", refresh),
      ]);
      return json({ claude, openai, codex, local });
    }),
  ];
}
