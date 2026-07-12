import { describe, expect, test } from "bun:test";
import { effectiveSecretsView, type SecretsView } from "./secrets";

const EMPTY: SecretsView = {
  ANTHROPIC_API_KEY: { configured: false, source: null },
  CODEX_API_KEY: { configured: false, source: null },
  OPENAI_API_KEY: { configured: false, source: null },
  OPENAI_COMPAT_API_KEY: { configured: false, source: null },
  TTS_API_KEY: { configured: false, source: null },
};

describe("effectiveSecretsView", () => {
  test("旧互換/TTSキーが公式OpenAIで有効な場合は移行元として見せる", () => {
    expect(effectiveSecretsView(EMPTY, true).OPENAI_API_KEY).toEqual({ configured: true, source: "legacy" });
  });

  test("TTS_API_KEY自身のKeychain/env状態は上書きしない", () => {
    const keychain: SecretsView = { ...EMPTY, OPENAI_API_KEY: { configured: true, source: "keychain" } };
    expect(effectiveSecretsView(keychain, true).OPENAI_API_KEY).toEqual({ configured: true, source: "keychain" });
    expect(effectiveSecretsView(EMPTY, false).OPENAI_API_KEY).toEqual({ configured: false, source: null });
  });
});
