import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { ensureTtsSettingsSchema, makeTtsSettingsStore } from "../tts-settings-store";

function fresh() {
  const db = new Database(":memory:");
  ensureTtsSettingsSchema(db);
  return { db, store: makeTtsSettingsStore(db) };
}

describe("tts-settings-store", () => {
  test("get: 未設定なら null（＝env/既定に従う）", () => {
    expect(fresh().store.get()).toBeNull();
  });

  test("save→get: 保存した値をそのまま返す（単一行 upsert）", () => {
    const { store } = fresh();
    const saved = store.save({
      baseUrl: "http://localhost:8880/v1", model: "kokoro", voice: "af_sky",
      openaiModel: "gpt-4o-mini-tts", openaiVoice: "alloy",
    });
    expect(store.get()).toEqual(saved);
  });

  test("save: 2回目は同じ行を上書きする（id=1 単一行・null で既定へ戻せる）", () => {
    const { store } = fresh();
    store.save({ baseUrl: "http://localhost:8880/v1", model: "kokoro", voice: "af_sky", openaiModel: null, openaiVoice: null });
    store.save({ baseUrl: null, model: null, voice: null, openaiModel: null, openaiVoice: null });
    expect(store.get()).toEqual({ baseUrl: null, model: null, voice: null, openaiModel: null, openaiVoice: null });
  });

  test("旧設定が公式URLなら公式モデル・音声へ仮想移行する", () => {
    const { db, store } = fresh();
    db.run(
      "INSERT INTO tts_settings (id, base_url, model, voice, updated_at) VALUES (1, 'https://api.openai.com/v1/', 'gpt-4o-mini-tts', 'nova', '2026-01-01T00:00:00Z')",
    );
    expect(store.get()).toEqual({
      baseUrl: null, model: null, voice: null,
      openaiModel: "gpt-4o-mini-tts", openaiVoice: "nova",
    });
  });

  test("公式と互換の設定を別テーブルで保持する", () => {
    const { db, store } = fresh();
    store.save({
      baseUrl: "http://localhost:8880/v1", model: "kokoro", voice: "af_sky",
      openaiModel: "gpt-4o-mini-tts", openaiVoice: "nova",
    });
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM tts_openai_settings").get()?.n).toBe(1);
  });
});
