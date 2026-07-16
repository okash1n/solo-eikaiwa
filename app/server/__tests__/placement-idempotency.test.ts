import { describe, expect, test } from "bun:test";
import { openDb } from "../db";
import { makePlacementStore, type PlacementSubmission } from "../placement";
import { makeProgressStore } from "../progress-store";
import { makeFetchHandler } from "../routes";
import { makeTestDeps } from "./helpers/route-deps";
import { postJson } from "./helpers/http";

const VALID_TASKS = [
  { taskId: "self-intro", transcript: "I am an engineer.", durationSec: 40, wordCount: 4 },
  { taskId: "describe-situation", transcript: "My laptop restarted before the meeting.", durationSec: 60, wordCount: 6 },
  { taskId: "give-opinion", transcript: "I agree because commuting takes time.", durationSec: 35, wordCount: 6 },
];

/** 実DB・実ストアで submit 経路を組む（LLM評価だけフェイクにして呼び出し回数を数える） */
function makeRealSubmitSetup() {
  const db = openDb(":memory:");
  const placementStore = makePlacementStore(db);
  const progressStore = makeProgressStore(db);
  let evalCalls = 0;
  const { deps } = makeTestDeps({
    placementStore,
    progressStore,
    evaluatePlacement: async (_subs: PlacementSubmission[]) => {
      evalCalls += 1;
      return { stage: 2, startLevel: 13, rationaleJa: "簡単な文は安定しています。" };
    },
  });
  return { db, handler: makeFetchHandler(deps), evalCalls: () => evalCalls };
}

function counts(db: ReturnType<typeof openDb>) {
  return {
    results: db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM placement_results").get()!.n,
    xp: db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM xp_events WHERE kind = 'placement'").get()!.n,
  };
}

describe("placement submit の冪等化", () => {
  test("同じsubmissionIdの再送は結果保存・XP付与・LLM評価を増やさず初回と同じ応答を返す", async () => {
    const { db, handler, evalCalls } = makeRealSubmitSetup();
    const body = { tasks: VALID_TASKS, submissionId: "placement-submit-0001" };

    const first = await handler(postJson("/api/placement/submit", body));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toEqual({ stage: 2, startLevel: 13, rationale: "簡単な文は安定しています。" });

    const second = await handler(postJson("/api/placement/submit", body));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(firstBody);

    expect(counts(db)).toEqual({ results: 1, xp: 1 });
    expect(db.query<{ total: number | null }, []>(
      "SELECT SUM(amount) AS total FROM xp_events WHERE kind = 'placement'").get()!.total).toBe(10);
    expect(evalCalls()).toBe(1);
  });

  test("同じsubmissionIdを別データへ使い回すと409で何も記録しない", async () => {
    const { db, handler } = makeRealSubmitSetup();
    const submissionId = "placement-submit-conflict";
    expect((await handler(postJson("/api/placement/submit", { tasks: VALID_TASKS, submissionId }))).status).toBe(200);

    const altered = [{ ...VALID_TASKS[0], transcript: "Completely different answer." }, VALID_TASKS[1], VALID_TASKS[2]];
    const res = await handler(postJson("/api/placement/submit", { tasks: altered, submissionId }));
    expect(res.status).toBe(409);
    expect(counts(db)).toEqual({ results: 1, xp: 1 });
  });

  test("submissionIdが欠落・不正なら400で保存もXP付与もしない", async () => {
    const { db, handler } = makeRealSubmitSetup();
    expect((await handler(postJson("/api/placement/submit", { tasks: VALID_TASKS }))).status).toBe(400);
    expect((await handler(postJson("/api/placement/submit", { tasks: VALID_TASKS, submissionId: "short" }))).status).toBe(400);
    expect((await handler(postJson("/api/placement/submit", { tasks: VALID_TASKS, submissionId: 42 }))).status).toBe(400);
    expect(counts(db)).toEqual({ results: 0, xp: 0 });
  });

  test("並列再送でも記録は1回だけで、全応答が同じ結果を返す", async () => {
    const { db, handler } = makeRealSubmitSetup();
    const body = { tasks: VALID_TASKS, submissionId: "placement-submit-parallel" };
    const responses = await Promise.all(Array.from({ length: 4 }, () => handler(postJson("/api/placement/submit", body))));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    for (const b of bodies) expect(b).toEqual({ stage: 2, startLevel: 13, rationale: "簡単な文は安定しています。" });
    expect(counts(db)).toEqual({ results: 1, xp: 1 });
  });

  test("結果保存が失敗したら台帳もXPも残らず、再試行で正常に記録できる", async () => {
    const { db, handler } = makeRealSubmitSetup();
    const body = { tasks: VALID_TASKS, submissionId: "placement-submit-fault" };
    db.run(`CREATE TRIGGER fail_placement_insert BEFORE INSERT ON placement_results
      BEGIN SELECT RAISE(ABORT, 'placement save failed'); END`);

    const failed = await handler(postJson("/api/placement/submit", body));
    expect(failed.status).toBe(500);
    expect(counts(db)).toEqual({ results: 0, xp: 0 });
    expect(db.query<{ n: number }, []>(
      "SELECT COUNT(*) AS n FROM placement_submission_events").get()!.n).toBe(0);

    db.run("DROP TRIGGER fail_placement_insert");
    const retried = await handler(postJson("/api/placement/submit", body));
    expect(retried.status).toBe(200);
    expect(counts(db)).toEqual({ results: 1, xp: 1 });
  });

  test("XP付与が失敗しても測定結果は保存され、再送で二重記録しない（bestEffort維持）", async () => {
    const { db, handler } = makeRealSubmitSetup();
    const body = { tasks: VALID_TASKS, submissionId: "placement-submit-xp-fault" };
    db.run(`CREATE TRIGGER fail_placement_xp BEFORE INSERT ON xp_events
      WHEN NEW.kind = 'placement' BEGIN SELECT RAISE(ABORT, 'xp write failed'); END`);

    const first = await handler(postJson("/api/placement/submit", body));
    expect(first.status).toBe(200);
    expect(counts(db)).toEqual({ results: 1, xp: 0 });

    db.run("DROP TRIGGER fail_placement_xp");
    const second = await handler(postJson("/api/placement/submit", body));
    expect(second.status).toBe(200);
    expect(counts(db)).toEqual({ results: 1, xp: 0 }); // 台帳済みの再送はXPを付け直さない（二重付与防止を優先）
  });
});
