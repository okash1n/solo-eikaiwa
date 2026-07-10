import { describe, expect, test } from "bun:test";
import { ttsAutoResolution } from "./tts-resolution";

const DEFAULT_URL = "https://api.openai.com/v1";

describe("ttsAutoResolution（「自動」が今どちらに解決されるかの表示用・サーバ tts.ts の暗黙決定と同一規則）", () => {
  test("キーなし + 既定/空 Base URL → say", () => {
    expect(ttsAutoResolution(false, "", DEFAULT_URL)).toBe("say");
    expect(ttsAutoResolution(false, DEFAULT_URL, DEFAULT_URL)).toBe("say");
    expect(ttsAutoResolution(false, "  ", DEFAULT_URL)).toBe("say");
  });

  test("キーありなら Base URL に関わらず HTTP", () => {
    expect(ttsAutoResolution(true, "", DEFAULT_URL)).toBe("openai-compat");
    expect(ttsAutoResolution(true, DEFAULT_URL, DEFAULT_URL)).toBe("openai-compat");
  });

  test("カスタム Base URL ならキーなしでも HTTP（入力中の値でライブに変わる）", () => {
    expect(ttsAutoResolution(false, "http://localhost:8880/v1", DEFAULT_URL)).toBe("openai-compat");
  });
});
