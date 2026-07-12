import type { Database } from "bun:sqlite";
import type { TtsSettings } from "./tts";
import { isOfficialOpenAiBaseUrl } from "./openai";

/** TTS プロバイダ設定の永続化（単一行 id=1）。APIキーは持たず、resolverから実行時に注入する。 */
export function ensureTtsSettingsSchema(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS tts_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    base_url TEXT,
    model TEXT,
    voice TEXT,
    updated_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS tts_openai_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    model TEXT,
    voice TEXT,
    updated_at TEXT NOT NULL
  )`);
}

export type TtsSettingsStore = {
  /** 保存済み設定。行が無ければ null（＝env/既定に従う）。 */
  get(): TtsSettings | null;
  /** 単一行(id=1)を upsert し、保存した設定をそのまま返す。妥当性は route が保証する。 */
  save(s: TtsSettings): TtsSettings;
};

type Row = { base_url: string | null; model: string | null; voice: string | null };
type OpenAiRow = { model: string | null; voice: string | null };

export function makeTtsSettingsStore(db: Database): TtsSettingsStore {
  return {
    get() {
      const row = db
        .query<Row, []>("SELECT base_url, model, voice FROM tts_settings WHERE id = 1")
        .get();
      const official = db.query<OpenAiRow, []>("SELECT model, voice FROM tts_openai_settings WHERE id = 1").get();
      if (!row && !official) return null;
      const legacyOfficial = Boolean(row && !official && (row.base_url === null || isOfficialOpenAiBaseUrl(row.base_url)));
      return {
        baseUrl: legacyOfficial ? null : row?.base_url ?? null,
        model: legacyOfficial ? null : row?.model ?? null,
        voice: legacyOfficial ? null : row?.voice ?? null,
        openaiModel: official?.model ?? (legacyOfficial ? row?.model ?? null : null),
        openaiVoice: official?.voice ?? (legacyOfficial ? row?.voice ?? null : null),
      };
    },
    save(s) {
      const now = new Date().toISOString();
      db.transaction(() => {
        db.run(
          `INSERT INTO tts_settings (id, base_url, model, voice, updated_at)
           VALUES (1, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             base_url = excluded.base_url,
             model = excluded.model,
             voice = excluded.voice,
             updated_at = excluded.updated_at`,
          [s.baseUrl, s.model, s.voice, now],
        );
        db.run(
          `INSERT INTO tts_openai_settings (id, model, voice, updated_at) VALUES (1, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET model = excluded.model, voice = excluded.voice, updated_at = excluded.updated_at`,
          [s.openaiModel ?? null, s.openaiVoice ?? null, now],
        );
      })();
      return s;
    },
  };
}
