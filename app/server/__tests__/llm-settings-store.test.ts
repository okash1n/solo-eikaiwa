import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ensureLlmSettingsSchema, makeLlmSettingsStore } from "../llm-settings-store";

function fresh() {
  const db = new Database(":memory:");
  ensureLlmSettingsSchema(db);
  return { db, store: makeLlmSettingsStore(db) };
}

describe("llm-settings-store", () => {
  test("初期状態は null（未設定＝環境変数に従う）", () => {
    expect(fresh().store.get()).toBeNull();
  });

  test("save → get で往復する（openai-compat）", () => {
    const { store } = fresh();
    const input = { provider: "openai-compat" as const, baseUrl: "http://localhost:11434/v1", model: "llama3", codexModel: null };
    expect(store.save(input)).toEqual(input);
    expect(store.get()).toEqual({ ...input, openaiModel: null });
  });

  test("再 save は単一行を上書きする（行が増えない）", () => {
    const { db, store } = fresh();
    store.save({ provider: "codex", baseUrl: null, model: null, codexModel: "o4-mini" });
    store.save({ provider: "claude", baseUrl: null, model: null, codexModel: null });
    const count = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM llm_settings").get();
    expect(count?.n).toBe(1);
    expect(store.get()).toEqual({ provider: "claude", baseUrl: null, model: null, openaiModel: null, codexModel: null });
  });

  test("旧 \"env\" センチネルの保存済み行は claude として読む（envフォールバック廃止の正規化）", () => {
    const { db, store } = fresh();
    db.run(
      "INSERT INTO llm_settings (id, provider, base_url, model, codex_model, updated_at) VALUES (1, 'env', NULL, NULL, NULL, '2026-01-01T00:00:00Z')",
    );
    expect(store.get()).toEqual({ provider: "claude", baseUrl: null, model: null, openaiModel: null, codexModel: null });
  });

  test("旧 openai-compat が公式URLなら公式 OpenAI として仮想移行する", () => {
    const { db, store } = fresh();
    db.run(
      "INSERT INTO llm_settings (id, provider, base_url, model, codex_model, updated_at) VALUES (1, 'openai-compat', 'https://api.openai.com/v1/', 'gpt-4.1-mini', NULL, '2026-01-01T00:00:00Z')",
    );
    expect(store.get()).toEqual({
      provider: "openai",
      baseUrl: null,
      model: null,
      openaiModel: "gpt-4.1-mini",
      codexModel: null,
    });
  });

  test("公式と互換のモデルバンクを分けて保存し、切替後も両方を保持する", () => {
    const { db, store } = fresh();
    const settings = {
      provider: "openai" as const,
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      openaiModel: "gpt-4.1-mini",
      codexModel: "gpt-5-codex",
    };
    expect(store.save(settings)).toEqual(settings);
    expect(store.get()).toEqual(settings);
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM llm_openai_settings").get()?.n).toBe(1);
  });
});
