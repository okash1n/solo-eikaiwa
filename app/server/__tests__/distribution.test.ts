import { describe, expect, test } from "bun:test";
import {
  availableLlmProviders,
  defaultLlmProvider,
  resolveDistribution,
} from "../distribution";

describe("distribution policy", () => {
  test("未指定と未知値はdirectとして扱う", () => {
    expect(resolveDistribution({})).toBe("direct");
    expect(resolveDistribution({ SOLO_EIKAIWA_DISTRIBUTION: "preview" })).toBe("direct");
  });

  test("app-storeは外部CLIを使わないHTTP providerだけを公開する", () => {
    expect(resolveDistribution({ SOLO_EIKAIWA_DISTRIBUTION: " app-store " })).toBe("app-store");
    expect(availableLlmProviders("app-store")).toEqual(["openai", "openai-compat"]);
    expect(defaultLlmProvider("app-store")).toBe("openai");
  });

  test("direct版は従来の4 providerを維持する", () => {
    expect(availableLlmProviders("direct")).toEqual(["claude", "openai", "openai-compat", "codex"]);
    expect(defaultLlmProvider("direct")).toBe("claude");
  });
});
