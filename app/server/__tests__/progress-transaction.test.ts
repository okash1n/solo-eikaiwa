import { describe, expect, test } from "bun:test";
import { openDb } from "../db";
import { makeProgressStore } from "../progress-store";
import { makeFetchHandler } from "../routes";
import { makeTestDeps } from "./helpers/route-deps";
import { postJson } from "./helpers/http";

describe("level change transaction", () => {
  const T = "2026-07-10";

  test("manual-set: user_progress 更新が失敗したら level_events に行を残さない", () => {
    const db = openDb(":memory:");
    const store = makeProgressStore(db);
    store.getSummary(T); // user_progress を先に作り、UPDATE だけを fault injection 対象にする
    db.run(`CREATE TRIGGER fail_progress_update BEFORE UPDATE ON user_progress
      BEGIN SELECT RAISE(ABORT, 'progress update failed'); END`);

    expect(() => store.levelAction("set", 20, T)).toThrow("progress update failed");
    db.run("DROP TRIGGER fail_progress_update");
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM level_events").get()!.n).toBe(0);
    expect(store.getLevel()).toBe(5); // DEFAULT_LEVEL のまま
  });

  test("placement-set: user_progress 更新が失敗したら level_events に行を残さない", () => {
    const db = openDb(":memory:");
    const store = makeProgressStore(db);
    store.getSummary(T);
    db.run(`CREATE TRIGGER fail_progress_update BEFORE UPDATE ON user_progress
      BEGIN SELECT RAISE(ABORT, 'progress update failed'); END`);

    expect(() => store.placementSet(23, T)).toThrow("progress update failed");
    db.run("DROP TRIGGER fail_progress_update");
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM level_events").get()!.n).toBe(0);
    expect(store.getLevel()).toBe(5);
  });

  test("accept: user_progress 更新が失敗したら accept イベントを残さない（履歴と実レベルの食い違い防止）", () => {
    const db = openDb(":memory:");
    const store = makeProgressStore(db);
    store.levelAction("set", 23, T); // stage 3 → 降格提案の対象
    // 直近7日窓の完了率 0/5 で down 提案を成立させる
    for (let i = 0; i < 5; i++) {
      db.run("INSERT INTO block_attempts (ts, ymd, kind, completed) VALUES (?, ?, ?, 0)",
        ["2026-07-08T09:00:00", "2026-07-08", "roleplay"]);
    }
    const shown = store.getSummary(T).proposal!;
    expect(shown.kind).toBe("down");
    const before = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM level_events").get()!.n;
    db.run(`CREATE TRIGGER fail_progress_update BEFORE UPDATE ON user_progress
      BEGIN SELECT RAISE(ABORT, 'progress update failed'); END`);

    expect(() => store.levelAction("accept", undefined, T, shown)).toThrow("progress update failed");
    db.run("DROP TRIGGER fail_progress_update");
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM level_events").get()!.n).toBe(before);
    expect(store.getLevel()).toBe(23); // レベルは旧値のまま・履歴にも accept は残らない
  });
});

describe("block completion transaction", () => {
  test("同じcompletionIdの並列再送でもattempt完了とXPを1回だけcommitする", async () => {
    const db = openDb(":memory:");
    const progressStore = makeProgressStore(db);
    const { attemptId } = progressStore.blockStart("reflection", "2026-07-10");
    const h = makeFetchHandler(makeTestDeps({ progressStore }).deps);
    const body = {
      kind: "block",
      amount: 5,
      attemptId,
      blockKind: "reflection",
      completionId: "completion-parallel-001",
    };

    const responses = await Promise.all(Array.from({ length: 4 }, () => h(postJson("/api/progress/xp", body))));
    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    expect(progressStore.getSummary("2026-07-10").xp).toBe(5);
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM xp_events WHERE kind = 'block'").get()!.n).toBe(1);
    expect(db.query<{ completed: number }, [number]>(
      "SELECT completed FROM block_attempts WHERE id = ?",
    ).get(attemptId)!.completed).toBe(1);
  });

  test("block-start失敗相当のattemptIdなしでも同じcompletionIdを安全に再試行できる", async () => {
    const db = openDb(":memory:");
    const progressStore = makeProgressStore(db);
    const h = makeFetchHandler(makeTestDeps({ progressStore }).deps);
    const body = {
      kind: "block",
      amount: 5,
      blockKind: "reflection",
      completionId: "completion-without-attempt",
    };
    expect((await h(postJson("/api/progress/xp", body))).status).toBe(200);
    expect((await h(postJson("/api/progress/xp", body))).status).toBe(200);
    expect(progressStore.getSummary("2026-07-10").xp).toBe(5);
  });
});
