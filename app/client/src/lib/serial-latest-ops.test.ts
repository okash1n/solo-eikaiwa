import { describe, expect, test } from "bun:test";
import { makeSerialLatestOps } from "./serial-latest-ops";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** マイクロタスクを消化して、直列キューの次の操作を開始させる */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("secret操作の直列化と最新応答の反映", () => {
  test("操作は開始順に1件ずつ実行される（先行が完了するまで後続は始まらない）", async () => {
    const ops = makeSerialLatestOps();
    const first = deferred<string>();
    let secondStarted = false;

    const firstOp = ops.begin(() => first.promise);
    const secondOp = ops.begin(() => {
      secondStarted = true;
      return Promise.resolve("second");
    });

    await flushMicrotasks();
    expect(secondStarted).toBe(false);

    first.resolve("first");
    await expect(firstOp.settled).resolves.toBe("first");
    await expect(secondOp.settled).resolves.toBe("second");
    expect(secondStarted).toBe(true);
  });

  test("古い操作の応答は、後から新しい操作が始まっていると画面へ反映されない", async () => {
    const ops = makeSerialLatestOps();
    const applied: string[] = [];

    const firstOp = ops.begin(() => Promise.resolve("first"));
    await firstOp.settled;
    // 1件目の完了後・その再取得応答が返る前に、2件目の操作が始まる
    const secondOp = ops.begin(() => Promise.resolve("second"));

    // 1件目の系列に属する遅れて返った応答（再取得など）は捨てられる
    firstOp.apply(() => applied.push("stale-first"));
    await secondOp.settled;
    secondOp.apply(() => applied.push("latest-second"));

    expect(applied).toEqual(["latest-second"]);
  });

  test("保存と削除が逆順で完了しても、最後に開始した操作の応答だけが勝つ", async () => {
    const ops = makeSerialLatestOps();
    const applied: string[] = [];
    const save = deferred<string>();

    const saveOp = ops.begin(() => save.promise);
    const deleteOp = ops.begin(() => Promise.resolve("deleted"));

    // 直列化により、後から開始した削除は保存の完了を待つ（サーバ適用順と応答順が一致する）
    save.resolve("saved");
    await saveOp.settled;
    await deleteOp.settled;
    saveOp.apply(() => applied.push("saved"));
    deleteOp.apply(() => applied.push("deleted"));

    expect(applied).toEqual(["deleted"]);
  });

  test("失敗した操作の後も後続は実行され、失敗は呼び出し元へ伝わる", async () => {
    const ops = makeSerialLatestOps();
    const failure = new Error("keychain write failed");

    const failedOp = ops.begin(() => Promise.reject(failure));
    const nextOp = ops.begin(() => Promise.resolve("recovered"));

    await expect(failedOp.settled).rejects.toBe(failure);
    await expect(nextOp.settled).resolves.toBe("recovered");
  });

  test("最新の操作の apply は効果を反映する", async () => {
    const ops = makeSerialLatestOps();
    let appliedCount = 0;

    const op = ops.begin(() => Promise.resolve("only"));
    await op.settled;
    op.apply(() => { appliedCount += 1; });
    op.apply(() => { appliedCount += 1; });

    expect(appliedCount).toBe(2);
  });
});
