import type { LlmProvider } from "./llm-provider";

export type AppDistribution = "direct" | "app-store";

const DIRECT_PROVIDERS: readonly LlmProvider[] = ["claude", "openai", "openai-compat", "codex"];
const APP_STORE_PROVIDERS: readonly LlmProvider[] = ["openai", "openai-compat"];

export function resolveDistribution(
  env: Record<string, string | undefined> = Bun.env,
): AppDistribution {
  return env.SOLO_EIKAIWA_DISTRIBUTION?.trim() === "app-store" ? "app-store" : "direct";
}

export function availableLlmProviders(distribution: AppDistribution): readonly LlmProvider[] {
  return distribution === "app-store" ? APP_STORE_PROVIDERS : DIRECT_PROVIDERS;
}

export function defaultLlmProvider(distribution: AppDistribution): LlmProvider {
  return distribution === "app-store" ? "openai" : "claude";
}
