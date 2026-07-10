import { describe, expect, test } from "bun:test";
import { CodexAppServerClient, TransportError, type SpawnAppServer } from "../providers/codex-app-server";
import { makeFakeProc, makeScriptedProc } from "./helpers/fake-app-server";

describe("CodexAppServerClient", () => {
  test("初回requestでinitializeハンドシェイクを行いid対応でレスポンスを返す", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const p = client.request("thread/start", { sandbox: "read-only" });
    await Bun.sleep(0);
    // 1通目= initialize
    expect(f.sent[0]?.method).toBe("initialize");
    f.emit({ id: f.sent[0]!.id, result: { userAgent: "codex" } });
    await Bun.sleep(0);
    // 2通目= initialized 通知（id無し）、3通目= thread/start
    expect(f.sent[1]).toEqual({ method: "initialized" });
    expect(f.sent[2]?.method).toBe("thread/start");
    f.emit({ id: f.sent[2]!.id, result: { thread: { id: "t-1" } } });
    expect((await p).thread).toEqual({ id: "t-1" });
  });

  test("runTurnはitem/completedのagentMessageを集めturn/completedで解決する", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    f.emit({ id: f.sent[2]!.id, result: { thread: { id: "t-1" } } });
    await first;

    const turn = client.runTurn("t-1", "Hello");
    await Bun.sleep(0);
    const turnReq = f.sent.find((m) => m.method === "turn/start")!;
    expect(turnReq.params).toEqual({ threadId: "t-1", input: [{ type: "text", text: "Hello" }] });
    f.emit({ id: turnReq.id, result: { turn: { id: "turn-1" } } });
    f.emit({ method: "unknown/notification", params: {} }); // 未知通知は無視
    f.emit({ method: "item/completed", params: { threadId: "t-1", item: { type: "agentMessage", id: "i1", text: "Hi there" } } });
    f.emit({ method: "turn/completed", params: { threadId: "t-1", turn: { status: "completed" } } });
    expect(await turn).toBe("Hi there");
  });

  test("runTurnのAbortSignalでturn/interruptを送り待機を解除する", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    f.emit({ id: f.sent[2]!.id, result: { thread: { id: "t-1" } } });
    await first;

    const controller = new AbortController();
    const reason = new Error("cancel turn");
    const turn = client.runTurn("t-1", "Hello", controller.signal);
    await Bun.sleep(0);
    const turnReq = f.sent.find((m) => m.method === "turn/start")!;
    f.emit({ id: turnReq.id, result: { turn: { id: "turn-1" } } });
    await Bun.sleep(0);
    controller.abort(reason);
    await expect(turn).rejects.toBe(reason);
    await Bun.sleep(0);
    const interrupt = f.sent.find((m) => m.method === "turn/interrupt")!;
    expect(interrupt.params).toEqual({ threadId: "t-1", turnId: "turn-1" });
    const pending = (client as unknown as { pending: Map<number, unknown> }).pending;
    expect(pending.size).toBe(0); // interrupt応答待ちのtimerを残さない
  });

  test("共有handshake待機中でも個別requestのcancelを即時反映する", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const first = client.request("thread/start", { name: "first" });
    const controller = new AbortController();
    const reason = new Error("cancel second");
    const second = client.request("thread/start", { name: "second" }, controller.signal);

    controller.abort(reason);
    await expect(second).rejects.toBe(reason);
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    const firstReq = f.sent.find(
      (message) => message.method === "thread/start"
        && (message.params as Record<string, unknown>).name === "first",
    )!;
    f.emit({ id: firstReq.id, result: { thread: { id: "t-first" } } });
    expect((await first).thread).toEqual({ id: "t-first" });
  });

  test("turn失敗はエラーになりエラー内容を含む", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    f.emit({ id: f.sent[2]!.id, result: { thread: { id: "t-1" } } });
    await first;
    const turn = client.runTurn("t-1", "Hello");
    await Bun.sleep(0);
    const turnReq = f.sent.find((m) => m.method === "turn/start")!;
    f.emit({ id: turnReq.id, result: { turn: {} } });
    f.emit({ method: "turn/completed", params: { threadId: "t-1", turn: { status: "failed", error: { message: "boom" } } } });
    expect(turn).rejects.toThrow(/boom|failed/);
  });

  test("承認系ServerRequestにはdeclineを返す", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    f.emit({ id: f.sent[2]!.id, result: { thread: { id: "t-1" } } });
    await first;
    f.emit({ id: 99, method: "item/commandExecution/requestApproval", params: {} });
    await Bun.sleep(0);
    expect(f.sent.find((m) => m.id === 99)).toEqual({ id: 99, result: { decision: "decline" } });
  });

  test("プロセスexitで保留中requestはrejectしalive()=false", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const p = client.request("thread/start", {});
    await Bun.sleep(0);
    f.exit(1);
    expect(p).rejects.toThrow(/exited/);
    expect(client.alive()).toBe(false);
  });

  test("send失敗をTransportErrorに分類しfallback可能にする", async () => {
    const f = makeFakeProc();
    f.proc.send = () => { throw new Error("broken pipe"); };
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);

    const error = await client.request("thread/start", {}).catch((caught) => caught);

    expect(error).toBeInstanceOf(TransportError);
    expect(error).toHaveProperty("message", expect.stringContaining("send failed"));
    expect(f.killCount).toBe(1);
  });

  test("turn/start応答前にexitしても未処理rejectionを起こさずrunTurnがTransportErrorでrejectする", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    f.emit({ id: f.sent[2]!.id, result: { thread: { id: "t-1" } } });
    await first;

    const turn = client.runTurn("t-1", "Hello");
    await Bun.sleep(0); // turn/start は送信済みだが応答はまだ届いていない
    f.exit(1);
    // ここで unhandled rejection が発生していれば bun test 自体がエラーを報告する（テスト成功が証拠）。
    await expect(turn).rejects.toThrow(/exited/);
  });

  test("ハンドシェイク失敗でclientが永久に汚染されず次のrequestで自己修復（再spawn・再ハンドシェイク）する", async () => {
    const fakes: ReturnType<typeof makeFakeProc>[] = [];
    const spawn: SpawnAppServer = () => {
      const f = makeFakeProc();
      fakes.push(f);
      return f.proc;
    };
    const client = new CodexAppServerClient(spawn);

    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    expect(fakes.length).toBe(1);
    fakes[0]!.exit(1); // initialize 応答前にexit → ハンドシェイク失敗
    await expect(first).rejects.toThrow(/exited/);
    expect(client.alive()).toBe(false);

    const second = client.request("thread/start", {});
    await Bun.sleep(0);
    expect(fakes.length).toBe(2); // 自己修復で2回目のspawnが発生する
    expect(fakes[1]!.sent[0]?.method).toBe("initialize"); // 新プロセスで再ハンドシェイク
    fakes[1]!.emit({ id: fakes[1]!.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    expect(fakes[1]!.sent[1]).toEqual({ method: "initialized" });
    expect(fakes[1]!.sent[2]?.method).toBe("thread/start");
    fakes[1]!.emit({ id: fakes[1]!.sent[2]!.id, result: { thread: { id: "t-2" } } });
    expect((await second).thread).toEqual({ id: "t-2" });
    expect(client.alive()).toBe(true);
  });

  test("異なるthreadIdのrunTurnは並行実行でき通知をインターリーブしてもそれぞれ正しく解決する", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    f.emit({ id: f.sent[2]!.id, result: { thread: { id: "t-1" } } });
    await first;

    const turnA = client.runTurn("t-1", "Hello A");
    await Bun.sleep(0);
    const turnB = client.runTurn("t-2", "Hello B");
    await Bun.sleep(0);

    const turnAReq = f.sent.find(
      (m) => m.method === "turn/start" && (m.params as Record<string, unknown>)?.threadId === "t-1",
    )!;
    const turnBReq = f.sent.find(
      (m) => m.method === "turn/start" && (m.params as Record<string, unknown>)?.threadId === "t-2",
    )!;
    expect(turnAReq).toBeDefined();
    expect(turnBReq).toBeDefined();

    f.emit({ id: turnAReq.id, result: { turn: { id: "turn-a" } } });
    f.emit({ id: turnBReq.id, result: { turn: { id: "turn-b" } } });

    // 通知をインターリーブして届ける（B→A→B→A の順）
    f.emit({ method: "item/completed", params: { threadId: "t-2", item: { type: "agentMessage", id: "ib", text: "Hi B" } } });
    f.emit({ method: "item/completed", params: { threadId: "t-1", item: { type: "agentMessage", id: "ia", text: "Hi A" } } });
    f.emit({ method: "turn/completed", params: { threadId: "t-2", turn: { status: "completed" } } });
    f.emit({ method: "turn/completed", params: { threadId: "t-1", turn: { status: "completed" } } });

    expect(await turnA).toBe("Hi A");
    expect(await turnB).toBe("Hi B");
  });

  test("exit後に届く遅延ServerRequestは無視される（throwも送信もしない）", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const p = client.request("thread/start", {});
    await Bun.sleep(0);
    f.exit(1);
    await expect(p).rejects.toThrow(/exited/);
    const sentBefore = f.sent.length;
    // 死んだプロセスからの遅延 ServerRequest: 世代ガードで無視される（proc.send への応答で throw しない）
    expect(() => f.emit({ id: 7, method: "item/commandExecution/requestApproval", params: {} })).not.toThrow();
    await Bun.sleep(0);
    expect(f.sent.length).toBe(sentBefore);
  });

  test("再spawn後に旧プロセスから届く遅延メッセージは無視される（新世代のpendingを解決しない）", async () => {
    const fakes: ReturnType<typeof makeFakeProc>[] = [];
    const spawn: SpawnAppServer = () => {
      const f = makeFakeProc();
      fakes.push(f);
      return f.proc;
    };
    const client = new CodexAppServerClient(spawn);
    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    fakes[0]!.exit(1);
    await expect(first).rejects.toThrow(/exited/);

    const second = client.request("thread/start", {});
    await Bun.sleep(0);
    expect(fakes.length).toBe(2);
    const initId = fakes[1]!.sent[0]!.id; // 新プロセスの initialize リクエストid
    // 旧プロセスオブジェクトから同じidの応答が遅れて届いても、新世代の pending を解決しない
    fakes[0]!.emit({ id: initId, result: { userAgent: "stale" } });
    await Bun.sleep(0);
    expect(fakes[1]!.sent.length).toBe(1); // initialized 通知が出ていない = ハンドシェイク未解決のまま
    // 正しい新プロセスからの応答で初めて進む
    fakes[1]!.emit({ id: initId, result: {} });
    await Bun.sleep(0);
    expect(fakes[1]!.sent[1]).toEqual({ method: "initialized" });
    expect(fakes[1]!.sent[2]?.method).toBe("thread/start");
    fakes[1]!.emit({ id: fakes[1]!.sent[2]!.id, result: { thread: { id: "t-2" } } });
    expect((await second).thread).toEqual({ id: "t-2" });
  });

  test("プロセス生存のままinitializeがエラー応答でも汚染されず、次のrequestで再spawnして自己修復する", async () => {
    const fakes: ReturnType<typeof makeFakeProc>[] = [];
    const spawn: SpawnAppServer = () => {
      const f = makeFakeProc();
      fakes.push(f);
      return f.proc;
    };
    const client = new CodexAppServerClient(spawn);

    const first = client.request("thread/start", {});
    await Bun.sleep(0);
    expect(fakes.length).toBe(1);
    // initialize にエラー応答（プロセスは exit せず生存したまま）
    fakes[0]!.emit({ id: fakes[0]!.sent[0]!.id, error: { message: "nope" } });
    await expect(first).rejects.toThrow(/handshake failed/);
    // 生きていたプロセスは孤児にせず kill される（fake の kill は realSpawnAppServer と同様 exit を発火する）
    expect(fakes[0]!.killCount).toBe(1);

    // 失敗した handshakePromise を再利用せず、新プロセスを spawn してハンドシェイクをやり直す
    const second = client.request("thread/start", {});
    await Bun.sleep(0);
    expect(fakes.length).toBe(2);
    expect(fakes[1]!.sent[0]?.method).toBe("initialize");
    fakes[1]!.emit({ id: fakes[1]!.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    expect(fakes[1]!.sent[1]).toEqual({ method: "initialized" });
    expect(fakes[1]!.sent[2]?.method).toBe("thread/start");
    fakes[1]!.emit({ id: fakes[1]!.sent[2]!.id, result: { thread: { id: "t-heal" } } });
    expect((await second).thread).toEqual({ id: "t-heal" });
  });

  test("listModelsはmodel/listをparams:{}で送りresult.dataを返す（モデルカタログ取得・Task 3）", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const p = client.listModels();
    await Bun.sleep(0);
    expect(f.sent[0]?.method).toBe("initialize");
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    const req = f.sent.find((m) => m.method === "model/list")!;
    expect(req.params).toEqual({});
    f.emit({ id: req.id, result: { data: [{ id: "gpt-5.6-codex" }] } });
    expect(await p).toEqual([{ id: "gpt-5.6-codex" }]);
  });

  test("listModelsはnextCursorがある限りcursorを渡してページングし、全ページのdataを連結する（レビュー指摘: ページネーション対応）", async () => {
    const f = makeScriptedProc({
      "model/list": (m) => {
        const params = m.params as Record<string, unknown>;
        if (params.cursor === undefined) {
          return [{ id: m.id, result: { data: [{ id: "a" }], nextCursor: "page2" } }];
        }
        if (params.cursor === "page2") {
          return [{ id: m.id, result: { data: [{ id: "b" }], nextCursor: null } }];
        }
        throw new Error(`unexpected cursor: ${String(params.cursor)}`);
      },
    });
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const models = await client.listModels();
    expect(models).toEqual([{ id: "a" }, { id: "b" }]);
    const reqs = f.sent.filter((m) => m.method === "model/list");
    expect(reqs.length).toBe(2);
    expect(reqs[0]!.params).toEqual({});
    expect(reqs[1]!.params).toEqual({ cursor: "page2" });
  });

  test("nextCursorが尽きない場合はMAX_MODEL_LIST_PAGES上限でthrowし、知らないうちに部分リストを返さない（レビュー指摘）", async () => {
    let page = 0;
    const f = makeScriptedProc({
      "model/list": (m) => {
        page++;
        return [{ id: m.id, result: { data: [{ id: `p${page}` }], nextCursor: `cursor-${page}` } }];
      },
    });
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    await expect(client.listModels()).rejects.toThrow(/pagination/);
  });

  test("listModelsはresult.dataが配列でなければ空配列を返す", async () => {
    const f = makeFakeProc();
    const client = new CodexAppServerClient((() => f.proc) as SpawnAppServer);
    const p = client.listModels();
    await Bun.sleep(0);
    f.emit({ id: f.sent[0]!.id, result: {} });
    await Bun.sleep(0);
    const req = f.sent.find((m) => m.method === "model/list")!;
    f.emit({ id: req.id, result: {} });
    expect(await p).toEqual([]);
  });
});
