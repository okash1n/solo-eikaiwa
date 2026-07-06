import type { Database } from "bun:sqlite";

/** 直前の INSERT で採番された rowid を返す。各ストアの save/blockStart が共有する。 */
export function insertReturningId(db: Database): number {
  return db.query<{ id: number }, []>("SELECT last_insert_rowid() AS id").get()!.id;
}
