import { afterEach, describe, expect, mock, test } from "bun:test";
import { onProgressUpdate, progressBlockXp, progressLevelAction, type ProgressSummary } from "./progress";

const SUMMARY: ProgressSummary = {
  level: 3, xp: 10, xpIntoLevel: 10, xpToNext: 5, stage: 1, difficultyMaxed: false, proposal: null,
};

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stubFetchOk(body: unknown): void {
  globalThis.fetch = mock(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch;
}

describe("progress の summary 自動通知", () => {
  test("progressBlockXp は summary を購読者へ通知し、同じ値を返す", async () => {
    stubFetchOk(SUMMARY);
    const seen: ProgressSummary[] = [];
    const unsub = onProgressUpdate((s) => seen.push(s));
    const returned = await progressBlockXp(2, 1);
    unsub();
    expect(returned).toEqual(SUMMARY);
    expect(seen).toEqual([SUMMARY]);
  });

  test("progressLevelAction も同じラッパで通知する", async () => {
    stubFetchOk(SUMMARY);
    const seen: ProgressSummary[] = [];
    const unsub = onProgressUpdate((s) => seen.push(s));
    await progressLevelAction("accept");
    unsub();
    expect(seen).toEqual([SUMMARY]);
  });
});
