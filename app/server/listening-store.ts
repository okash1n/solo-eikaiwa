import type { Database } from "bun:sqlite";
import { insertReturningId } from "./db-util";

export type ListeningLogRow = { id: number; ts: string; ymd: string; itemId: string };

export type ListeningStore = {
  /** 1回の聴取を記録する（記録と情報表示のみ・ノルマ判定はしない）。ymd は呼び出し側のローカル日付。 */
  log(itemId: string, ymd: string): ListeningLogRow;
  /** fromYmd 以降（fromYmd を含む）の聴取回数。「今週n本」の情報表示に使う。 */
  countSince(fromYmd: string): number;
};

export function ensureListeningSchema(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS listening_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    ymd TEXT NOT NULL,
    item_id TEXT NOT NULL
  )`);
}

export function makeListeningStore(db: Database): ListeningStore {
  return {
    log(itemId, ymd) {
      const ts = new Date().toISOString();
      db.run("INSERT INTO listening_logs (ts, ymd, item_id) VALUES (?, ?, ?)", [ts, ymd, itemId]);
      return { id: insertReturningId(db), ts, ymd, itemId };
    },
    countSince(fromYmd) {
      const row = db
        .query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM listening_logs WHERE ymd >= ?")
        .get(fromYmd);
      return row?.n ?? 0;
    },
  };
}
