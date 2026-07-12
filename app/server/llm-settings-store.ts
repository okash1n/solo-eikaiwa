import type { Database } from "bun:sqlite";
import type { LlmSettings } from "./llm-provider";
import { isOfficialOpenAiBaseUrl } from "./openai";

/** LLM プロバイダ設定の永続化（単一行 id=1）。APIキーは持たず、resolverから実行時に注入する。 */
export function ensureLlmSettingsSchema(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS llm_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider TEXT NOT NULL,
    base_url TEXT,
    model TEXT,
    codex_model TEXT,
    updated_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS llm_openai_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    model TEXT,
    updated_at TEXT NOT NULL
  )`);
}

export type LlmSettingsStore = {
  /** 保存済み設定。行が無ければ null（呼び出し側が DEFAULT_LLM_SETTINGS=claude を既定にする）。 */
  get(): LlmSettings | null;
  /** 単一行(id=1)を upsert し、保存した設定をそのまま返す。provider の妥当性は route が保証する。 */
  save(s: LlmSettings): LlmSettings;
};

type Row = { provider: string; base_url: string | null; model: string | null; codex_model: string | null };
type OpenAiRow = { model: string | null };

export function makeLlmSettingsStore(db: Database): LlmSettingsStore {
  return {
    get() {
      const row = db
        .query<Row, []>("SELECT provider, base_url, model, codex_model FROM llm_settings WHERE id = 1")
        .get();
      if (!row) return null;
      const official = db.query<OpenAiRow, []>("SELECT model FROM llm_openai_settings WHERE id = 1").get();
      const legacyOfficial = !official
        && row.provider === "openai-compat"
        && isOfficialOpenAiBaseUrl(row.base_url);
      return {
        // 旧 "env"（環境変数に従う）センチネルの保存済み行は claude として解釈する
        // （env フォールバック廃止・v0.29。行の削除・書き戻しはしない）。
        provider: (row.provider === "env" ? "claude" : legacyOfficial ? "openai" : row.provider) as LlmSettings["provider"],
        baseUrl: legacyOfficial ? null : row.base_url,
        model: legacyOfficial ? null : row.model,
        openaiModel: official?.model ?? (legacyOfficial ? row.model : null),
        codexModel: row.codex_model,
      };
    },
    save(s) {
      const now = new Date().toISOString();
      db.transaction(() => {
        db.run(
          `INSERT INTO llm_settings (id, provider, base_url, model, codex_model, updated_at)
           VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             provider = excluded.provider,
             base_url = excluded.base_url,
             model = excluded.model,
             codex_model = excluded.codex_model,
             updated_at = excluded.updated_at`,
          [s.provider, s.baseUrl, s.model, s.codexModel, now],
        );
        db.run(
          `INSERT INTO llm_openai_settings (id, model, updated_at) VALUES (1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET model = excluded.model, updated_at = excluded.updated_at`,
          [s.openaiModel ?? null, now],
        );
      })();
      return s;
    },
  };
}
