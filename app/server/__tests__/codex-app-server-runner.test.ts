import { describe, expect, test } from "bun:test";
import {
  makeCodexAppServerRunner,
  getCodexAppServerRunner,
  __resetCodexAppServerRegistry,
  isTestedCodexVersion,
  TESTED_CODEX_VERSION,
  TransportError,
  type CodexAppServerConfig,
} from "../providers/codex-app-server";
import { withFallback, withTimeout } from "../providers/decorators";
import type { ClaudeRunner } from "../converse";
import { makeScriptedProc, type FakeProcHandle } from "./helpers/fake-app-server";

type Msg = Record<string, unknown>;

/** thread/start に ids を順番に払い出して応答するハンドラ */
function threadStartOk(ids: string[]) {
  let i = 0;
  return (m: Msg): Msg[] => [{ id: m.id, result: { thread: { id: ids[Math.min(i++, ids.length - 1)] } } }];
}

/** turn/start に応答し agentMessage → turn/completed を届けるハンドラ（呼び出しごとに replies を順に使う） */
function turnOk(replies: string[]) {
  let i = 0;
  return (m: Msg): Msg[] => {
    const threadId = (m.params as Msg).threadId;
    const text = replies[Math.min(i++, replies.length - 1)]!;
    return [
      { id: m.id, result: { turn: { id: `turn-${i}` } } },
      { method: "item/completed", params: { threadId, item: { type: "agentMessage", id: `item-${i}`, text } } },
      { method: "turn/completed", params: { threadId, turn: { status: "completed" } } },
    ];
  };
}

const CFG: Omit<CodexAppServerConfig, "spawn"> = {
  model: "gpt-5.5",
  reasoningEffort: "medium",
  serviceTier: "fast",
  defaultSystemPrompt: "SYS",
};

/** thread/start / thread/resume に毎回入る安全パラメータ（ブリーフ逐語） */
const EXPECTED_THREAD_PARAMS = {
  model: "gpt-5.5",
  serviceTier: "fast",
  sandbox: "read-only",
  approvalPolicy: "never",
  cwd: expect.any(String),
  developerInstructions: "SYS",
  config: { model_reasoning_effort: "medium" },
};

function runnerWith(f: FakeProcHandle, extra?: Partial<CodexAppServerConfig>) {
  return makeCodexAppServerRunner({ ...CFG, spawn: () => f.proc, ...extra });
}

describe("makeCodexAppServerRunner", () => {
  test("新規セッション: thread/start(sandbox/approval/model/config/developerInstructions) → turn/start → sessionId=threadId", async () => {
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1"]),
      "turn/start": turnOk(["Hi there"]),
    });
    const runner = runnerWith(f);
    const res = await runner("Hello");
    expect(res).toEqual({ text: "Hi there", sessionId: "t-1" });
    const startReq = f.sent.find((m) => m.method === "thread/start")!;
    expect(startReq.params).toEqual(EXPECTED_THREAD_PARAMS);
    const turnReq = f.sent.find((m) => m.method === "turn/start")!;
    expect(turnReq.params).toEqual({ threadId: "t-1", input: [{ type: "text", text: "Hello" }] });
  });

  test("既知sessionIdの継続: thread/startせずturn/startのみ・履歴Mapにも追記される", async () => {
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1", "t-2"]),
      "turn/start": turnOk(["Hi there", "Sure", "Folded reply"]),
    });
    const runner = runnerWith(f);
    const first = await runner("Hello");
    const second = await runner("Again", first.sessionId);
    expect(second).toEqual({ text: "Sure", sessionId: "t-1" });
    // 継続: thread/start は初回の1回だけ、2ターン目は turn/start のみ
    expect(f.sent.filter((m) => m.method === "thread/start").length).toBe(1);
    const turns = f.sent.filter((m) => m.method === "turn/start");
    expect(turns.length).toBe(2);
    expect((turns[1]!.params as Msg).threadId).toBe("t-1");
    expect(((turns[1]!.params as Msg).input as Msg[])[0]!.text).toBe("Again");
    // 履歴Mapへの追記を観測: systemPrompt を変えて fold を起こすと両ターンの往復が畳み込み入力に含まれる
    const third = await runner("Third", first.sessionId, { systemPrompt: "SYS2" });
    expect(third.sessionId).toBe("t-2");
    const foldText = ((f.sent.filter((m) => m.method === "turn/start")[2]!.params as Msg).input as Msg[])[0]!.text as string;
    expect(foldText).toContain("User: Hello");
    expect(foldText).toContain("Assistant: Hi there");
    expect(foldText).toContain("User: Again");
    expect(foldText).toContain("Assistant: Sure");
  });

  test("未知sessionId（プロセス再起動想定）: thread/resume成功→turn/start（パリティ経路）", async () => {
    const f = makeScriptedProc({
      "thread/resume": (m) => [{ id: m.id, result: { thread: { id: (m.params as Msg).threadId } } }],
      "turn/start": turnOk(["Welcome back"]),
    });
    const runner = runnerWith(f);
    const res = await runner("Hello again", "t-persisted");
    expect(res).toEqual({ text: "Welcome back", sessionId: "t-persisted" });
    const resumeReq = f.sent.find((m) => m.method === "thread/resume")!;
    expect(resumeReq.params).toEqual({ threadId: "t-persisted", ...EXPECTED_THREAD_PARAMS });
    expect(f.sent.filter((m) => m.method === "thread/start").length).toBe(0);
    const turnReq = f.sent.find((m) => m.method === "turn/start")!;
    expect((turnReq.params as Msg).threadId).toBe("t-persisted");
    expect(((turnReq.params as Msg).input as Msg[])[0]!.text).toBe("Hello again");
  });

  test("thread/resume失敗: 新thread/start + 保険トランスクリプトをcomposeCodexPromptで畳んだinputを送る", async () => {
    // proc1: 1往復成功（保険トランスクリプトが溜まる）→ 2ターン目の途中で死ぬ
    let turnCalls = 0;
    const f1: FakeProcHandle = makeScriptedProc({
      "thread/start": threadStartOk(["t-1"]),
      "turn/start": (m) => {
        turnCalls++;
        if (turnCalls === 2) {
          queueMicrotask(() => f1.exit(1));
          return [];
        }
        return turnOk(["Hi there"])(m);
      },
    });
    // proc2（再spawn後）: thread/resume はリクエストレベルで失敗 → 新スレッド + 畳み込み
    const f2 = makeScriptedProc({
      "thread/resume": (m) => [{ id: m.id, error: { message: "thread not found" } }],
      "thread/start": threadStartOk(["t-2"]),
      "turn/start": turnOk(["Recovered"]),
    });
    const procs = [f1, f2];
    let spawned = 0;
    const runner = makeCodexAppServerRunner({ ...CFG, spawn: () => procs[spawned++]!.proc });

    const first = await runner("Hello");
    expect(first.sessionId).toBe("t-1");
    // transport 障害 → threads.clear() で掃除してそのまま throw（フォールバック合成は
    // 呼び出し側 selectRunner の withFallback が担う。この runner 自体はもう合成しない）。
    // 既知スレッドの記憶はここで失効する。
    const lost = runner("Lost", "t-1");
    await expect(lost).rejects.toBeInstanceOf(TransportError);
    await expect(lost).rejects.toThrow(/exited/);
    // 次の呼び出し: thread/resume を試みて失敗 → 新 thread/start + 保険トランスクリプトの畳み込み
    const third = await runner("Again", "t-1");
    expect(third).toEqual({ text: "Recovered", sessionId: "t-2" });
    expect(f2.sent.filter((m) => m.method === "thread/resume").length).toBe(1);
    const foldTurn = f2.sent.find((m) => m.method === "turn/start")!;
    // system は developerInstructions 側にあるため [SYSTEM INSTRUCTIONS] ヘッダは重複させない
    expect(((foldTurn.params as Msg).input as Msg[])[0]!.text).toBe(
      "[CONVERSATION SO FAR]\nUser: Hello\nAssistant: Hi there\n\n[RESPOND TO THE FOLLOWING — output only the reply text, no preamble, no tool calls]\nUser: Again",
    );
  });

  test("同一sessionIdでsystemPromptが変わったら新スレッド（fold）", async () => {
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1", "t-2"]),
      "turn/start": turnOk(["Hi there", "New persona"]),
    });
    const runner = runnerWith(f);
    const first = await runner("Hello");
    const second = await runner("Switch", first.sessionId, { systemPrompt: "SYS2" });
    expect(second).toEqual({ text: "New persona", sessionId: "t-2" });
    const starts = f.sent.filter((m) => m.method === "thread/start");
    expect(starts.length).toBe(2);
    expect((starts[1]!.params as Msg).developerInstructions).toBe("SYS2");
    expect(f.sent.filter((m) => m.method === "thread/resume").length).toBe(0);
    const foldTurn = f.sent.filter((m) => m.method === "turn/start")[1]!;
    expect(((foldTurn.params as Msg).input as Msg[])[0]!.text).toBe(
      "[CONVERSATION SO FAR]\nUser: Hello\nAssistant: Hi there\n\n[RESPOND TO THE FOLLOWING — output only the reply text, no preamble, no tool calls]\nUser: Switch",
    );
  });

  test("fold二段: 畳み込み先スレッドのtranscriptが旧履歴を引き継ぎ、次のfoldにも全往復が残る", async () => {
    // startFolded が新スレッドの transcript を旧履歴で播種することの回帰テスト。
    // 播種が無いと、fold後の appendTurn は transcript.get(新threadId)=空 から書き始めるため、
    // 2段目の fold には直前の1往復しか現れない（Hello/Again の往復が消える）。
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1", "t-2", "t-3"]),
      "turn/start": turnOk(["Hi there", "Sure", "New persona", "Third persona"]),
    });
    const runner = runnerWith(f);
    const first = await runner("Hello");
    expect(first.sessionId).toBe("t-1");
    const second = await runner("Again", first.sessionId);
    expect(second).toEqual({ text: "Sure", sessionId: "t-1" });
    // 1段目のfold: systemPrompt変更で t-2 へ畳み込み
    const third = await runner("Third", second.sessionId, { systemPrompt: "SYS2" });
    expect(third).toEqual({ text: "New persona", sessionId: "t-2" });
    // 2段目のfold: さらにsystemPrompt変更で t-3 へ。ここに全3往復が残っていることが播種の証拠
    const fourth = await runner("Fourth", third.sessionId, { systemPrompt: "SYS3" });
    expect(fourth).toEqual({ text: "Third persona", sessionId: "t-3" });
    const turns = f.sent.filter((m) => m.method === "turn/start");
    expect(turns.length).toBe(4);
    const foldText2 = ((turns[3]!.params as Msg).input as Msg[])[0]!.text as string;
    expect(foldText2).toContain("User: Hello");
    expect(foldText2).toContain("Assistant: Hi there");
    expect(foldText2).toContain("User: Again");
    expect(foldText2).toContain("Assistant: Sure");
    expect(foldText2).toContain("User: Third");
    expect(foldText2).toContain("Assistant: New persona");
  });

  test("spawn失敗: TransportErrorをrethrowする（execFallbackは無くなった。委譲は selectRunner の withFallback が担う）", async () => {
    const runner = makeCodexAppServerRunner({
      ...CFG,
      spawn: () => { throw new Error("no codex binary"); },
    });
    await expect(runner("Hi", "sess-9", { systemPrompt: "SP" })).rejects.toBeInstanceOf(TransportError);
  });

  test("ターン中のプロセスexitでもTransportErrorをrethrowし、既知スレッドの記憶を掃除する", async () => {
    const f: FakeProcHandle = makeScriptedProc({
      "thread/start": threadStartOk(["t-1"]),
      "turn/start": () => {
        queueMicrotask(() => f.exit(1));
        return [];
      },
    });
    const runner = runnerWith(f);
    await expect(runner("Hello")).rejects.toBeInstanceOf(TransportError);
    // 既知スレッド(t-1)の記憶は掃除済み: 同じ resumeId での再呼び出しは（新プロセスが無いため
    // 引き続き transport 障害だが）turn/start を直に打とうとはせず resume 経路へ入ろうとする
    // ことを、spawn が新プロセスを返すシナリオの別テスト（thread/resume失敗のテスト）で確認済み。
  });

  test("turn.status=failed はモデル起因なのでそのままthrow（TransportErrorではない）", async () => {
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1"]),
      "turn/start": (m) => [
        { id: m.id, result: { turn: { id: "turn-1" } } },
        { method: "turn/completed", params: { threadId: (m.params as Msg).threadId, turn: { status: "failed", error: { message: "model exploded" } } } },
      ],
    });
    const runner = runnerWith(f);
    const rejection = runner("Hello");
    await expect(rejection).rejects.toThrow("model exploded");
    await expect(rejection).rejects.not.toBeInstanceOf(TransportError);
  });

  test("空のagentMessageはthrow('Codex returned empty result')（TransportErrorではない）", async () => {
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1"]),
      "turn/start": (m) => [
        { id: m.id, result: { turn: { id: "turn-1" } } },
        { method: "turn/completed", params: { threadId: (m.params as Msg).threadId, turn: { status: "completed" } } },
      ],
    });
    const runner = runnerWith(f);
    const rejection = runner("Hello");
    await expect(rejection).rejects.toThrow("Codex returned empty result");
    await expect(rejection).rejects.not.toBeInstanceOf(TransportError);
  });

  test("プロセス自発exit後の既知sessionIdは死んだ記憶でturn/startを打たずthread/resumeで復元する", async () => {
    const f1 = makeScriptedProc({
      "thread/start": threadStartOk(["t-1"]),
      "turn/start": turnOk(["Hi there"]),
    });
    const f2 = makeScriptedProc({
      "thread/resume": (m) => [{ id: m.id, result: { thread: { id: (m.params as Msg).threadId } } }],
      "turn/start": turnOk(["Restored"]),
    });
    const procs = [f1, f2];
    let spawned = 0;
    const runner = makeCodexAppServerRunner({ ...CFG, spawn: () => procs[spawned++]!.proc });
    const first = await runner("Hello");
    f1.exit(0); // ターン外でプロセスが自発終了（in-flight なし → エラーは観測されない）
    const second = await runner("Continue", first.sessionId);
    expect(second).toEqual({ text: "Restored", sessionId: "t-1" });
    // 新プロセスでは resume が turn/start より先に走る（死んだプロセスのスレッド記憶を直に使わない）
    const methods = f2.sent.map((m) => m.method);
    expect(methods.indexOf("thread/resume")).toBeGreaterThanOrEqual(0);
    expect(methods.indexOf("thread/resume")).toBeLessThan(methods.indexOf("turn/start"));
  });

  test("自発exit→再spawn後、他セッションも素のturn/startではなくthread/resumeで復元される（世代追跡）", async () => {
    // レビュー指摘の再現: 同一プロセス上に2セッション → 自発exit（in-flightなし）→
    // 先に t-A が resume で復元されると client は復活する（大域 alive() は true に戻る）。
    // このとき t-B の次の呼び出しが「復活した client」に騙されて素の turn/start を打ってはならない
    // （新プロセスは t-B を resume していないため、実サーバでは invalid_request で恒久失敗する）。
    const f1 = makeScriptedProc({
      "thread/start": threadStartOk(["t-A", "t-B"]),
      "turn/start": turnOk(["A1", "B1"]),
    });
    const f2 = makeScriptedProc({
      "thread/resume": (m) => [{ id: m.id, result: { thread: { id: (m.params as Msg).threadId } } }],
      "turn/start": turnOk(["A2", "B2"]),
    });
    const procs = [f1, f2];
    let spawned = 0;
    const runner = makeCodexAppServerRunner({ ...CFG, spawn: () => procs[spawned++]!.proc });

    const a = await runner("Hello A");
    const b = await runner("Hello B");
    expect([a.sessionId, b.sessionId]).toEqual(["t-A", "t-B"]);
    f1.exit(0); // ターン外の自発終了（in-flight なし → エラーは観測されない）

    const a2 = await runner("Continue A", "t-A"); // ここで新プロセスが spawn され client は復活する
    expect(a2).toEqual({ text: "A2", sessionId: "t-A" });
    const b2 = await runner("Continue B", "t-B");
    expect(b2).toEqual({ text: "B2", sessionId: "t-B" });

    // 両セッションとも新プロセスで resume されていること
    const resumes = f2.sent.filter((m) => m.method === "thread/resume").map((m) => (m.params as Msg).threadId);
    expect(resumes).toEqual(["t-A", "t-B"]);
    // t-B の turn/start は必ず t-B の thread/resume の後（素の turn/start が先行していない）
    const bResumeIdx = f2.sent.findIndex((m) => m.method === "thread/resume" && (m.params as Msg).threadId === "t-B");
    const bTurnIdx = f2.sent.findIndex((m) => m.method === "turn/start" && (m.params as Msg).threadId === "t-B");
    expect(bResumeIdx).toBeGreaterThanOrEqual(0);
    expect(bResumeIdx).toBeLessThan(bTurnIdx);
  });
});

describe("selectRunner相当の合成（withFallback(withTimeout(appServerRunner), execFake)）", () => {
  // llm-provider.ts の selectRunner の codex 分岐は
  // withFallback(withTimeout(getCodexAppServerRunner(conn)), makeCodexRunner(conn)) を組み立てる。
  // ここでは実 codex CLI に依存しないよう exec 側だけ fake にし、app-server 側は本物の
  // makeCodexAppServerRunner（spawn だけ注入）を使って、transport 障害→exec 委譲が
  // decorators + codex-app-server の実結線で end-to-end に通ることを確認する。
  test("app-serverのtransport障害（spawn失敗）→execFakeへ同一引数で委譲され結果が返る", async () => {
    const execCalls: unknown[][] = [];
    const execFake: ClaudeRunner = async (...args) => {
      execCalls.push(args);
      return { text: "exec-fallback-reply", sessionId: "exec-s" };
    };
    const appServerRunner = makeCodexAppServerRunner({
      ...CFG,
      spawn: () => { throw new Error("no codex binary"); },
    });
    const composed = withFallback(withTimeout(appServerRunner), execFake);

    const res = await composed("Hi", "sess-9", { systemPrompt: "SP" });

    expect(res).toEqual({ text: "exec-fallback-reply", sessionId: "exec-s" });
    expect(execCalls).toEqual([["Hi", "sess-9", { systemPrompt: "SP" }]]);
  });

  test("モデル起因の失敗（turn failed）はexecFakeへ委譲されずそのままthrowする", async () => {
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1"]),
      "turn/start": (m) => [
        { id: m.id, result: { turn: { id: "turn-1" } } },
        { method: "turn/completed", params: { threadId: (m.params as Msg).threadId, turn: { status: "failed", error: { message: "model exploded" } } } },
      ],
    });
    let execCalled = false;
    const execFake: ClaudeRunner = async () => {
      execCalled = true;
      return { text: "should not happen", sessionId: "exec-s" };
    };
    const composed = withFallback(withTimeout(runnerWith(f)), execFake);

    await expect(composed("Hello")).rejects.toThrow("model exploded");
    expect(execCalled).toBe(false);
  });
});

describe("getCodexAppServerRunner（registry: 接続設定キー単位でのプロセス共有）", () => {
  test("同一設定でrunnerを2回作ってもspawnは1回（プロセス共有）", async () => {
    __resetCodexAppServerRegistry();
    let spawnCalls = 0;
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1", "t-2"]),
      "turn/start": turnOk(["Hi there", "Yo"]),
    });
    const cfg: CodexAppServerConfig = { ...CFG, spawn: () => { spawnCalls++; return f.proc; } };

    const runnerA = getCodexAppServerRunner(cfg);
    const runnerB = getCodexAppServerRunner(cfg); // 同一キー: 新規プロセスは spawn されないはず

    await runnerA("Hello");
    await runnerB("World");

    expect(spawnCalls).toBe(1);
  });

  test("設定キーが変わると旧プロセスがkillされ新プロセスをspawnする", async () => {
    __resetCodexAppServerRegistry();
    const f1 = makeScriptedProc({ "thread/start": threadStartOk(["t-1"]), "turn/start": turnOk(["Hi there"]) });
    const f2 = makeScriptedProc({ "thread/start": threadStartOk(["t-2"]), "turn/start": turnOk(["Yo"]) });
    let killCalls = 0;
    f1.proc.kill = () => { killCalls++; };

    const runnerA = getCodexAppServerRunner({ ...CFG, model: "gpt-a", spawn: () => f1.proc });
    await runnerA("Hello"); // f1 を実際に spawn させる（proc がセットされないと kill() は no-op）
    expect(killCalls).toBe(0);

    const runnerB = getCodexAppServerRunner({ ...CFG, model: "gpt-b", spawn: () => f2.proc }); // キーが変わる
    expect(killCalls).toBe(1); // 旧クライアント(f1)が kill される

    const res = await runnerB("World");
    expect(res.sessionId).toBe("t-2"); // 新クライアント(f2)で新規スレッドが作られる
  });

  test("model/reasoningEffort/serviceTierが未指定(undefined)でも同一キーとして扱われる（正規化）", async () => {
    __resetCodexAppServerRegistry();
    let spawnCalls = 0;
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1", "t-2"]),
      "turn/start": turnOk(["Hi there", "Yo"]),
    });
    const base = { defaultSystemPrompt: "SYS" };
    const runnerA = getCodexAppServerRunner({ ...base, model: undefined, spawn: () => { spawnCalls++; return f.proc; } });
    const runnerB = getCodexAppServerRunner({ ...base, spawn: () => { spawnCalls++; return f.proc; } }); // model キー自体を省略

    await runnerA("Hello");
    await runnerB("World");

    expect(spawnCalls).toBe(1);
  });

  test("__resetCodexAppServerRegistry: reset後は同一キーでも新規spawnする（テスト間分離）", async () => {
    __resetCodexAppServerRegistry();
    let spawnCalls = 0;
    const f = makeScriptedProc({
      "thread/start": threadStartOk(["t-1", "t-2"]),
      "turn/start": turnOk(["Hi there", "Yo"]),
    });
    const cfg: CodexAppServerConfig = { ...CFG, spawn: () => { spawnCalls++; return f.proc; } };

    const runner1 = getCodexAppServerRunner(cfg);
    await runner1("Hello");
    expect(spawnCalls).toBe(1);

    __resetCodexAppServerRegistry();

    const runner2 = getCodexAppServerRunner(cfg); // 同一キーだが reset 済みなので新規 client
    await runner2("Again");
    expect(spawnCalls).toBe(2);
  });

  test("同一キーでの再取得（設定保存の再解決を模す）はthreads/transcriptも共有し、fold保険をリセットしない（レビューFix 1の回帰）", async () => {
    __resetCodexAppServerRegistry();
    // proc1: 1スレッドで2往復（保険トランスクリプトが2ラウンド溜まる）→ ターン外で自発終了
    const f1 = makeScriptedProc({
      "thread/start": threadStartOk(["t-1"]),
      "turn/start": turnOk(["Hi there", "Sure"]),
      // このハンドラは「修正前の挙動」なら踏む経路（threads Mapが空だと resume を試みてしまう）。
      // 修正後は f1 に thread/resume が飛ばないことをアサーションで確認する。
      "thread/resume": (m) => [{ id: m.id, error: { message: "unexpected resume on f1" } }],
    });
    // proc2（自発exit後の再spawn）: thread/resume はリクエストレベルで失敗 → 新スレッド+畳み込み
    const f2 = makeScriptedProc({
      "thread/resume": (m) => [{ id: m.id, error: { message: "thread not found" } }],
      "thread/start": threadStartOk(["t-2"]),
      "turn/start": turnOk(["Recovered"]),
    });
    const procs = [f1, f2];
    let spawned = 0;
    const cfg: CodexAppServerConfig = { ...CFG, spawn: () => procs[spawned++]!.proc };

    const runner1 = getCodexAppServerRunner(cfg);
    const first = await runner1("Hello");
    expect(first.sessionId).toBe("t-1");

    // 設定保存を模す: 同一キーで getCodexAppServerRunner を再取得する。修正前は buildRunner が
    // 毎回 fresh な threads/transcript Map を作るため、ここで runner1 が溜めた記憶が消えていた。
    const runner2 = getCodexAppServerRunner(cfg);

    // 継続呼び出しが thread/resume を経由しない fast path を通ることを確認する
    // （threads Map が runner1 側の記録を保持している証拠 = 世代・systemPrompt一致で即 turn/start）。
    const second = await runner2("Continue", first.sessionId);
    expect(second).toEqual({ text: "Sure", sessionId: "t-1" });
    expect(f1.sent.filter((m) => m.method === "thread/resume").length).toBe(0);

    // プロセスをターン外で自発終了させ、次の呼び出しで thread/resume を強制的に失敗させる
    // （新プロセスは t-1 を知らない）→ 保険トランスクリプトへの畳み込みが起きる。
    f1.exit(0);
    const third = await runner2("Again", first.sessionId);
    expect(third.sessionId).toBe("t-2");
    expect(f2.sent.filter((m) => m.method === "thread/resume").length).toBe(1);
    const foldTurn = f2.sent.find((m) => m.method === "turn/start")!;
    const foldText = ((foldTurn.params as Msg).input as Msg[])[0]!.text as string;
    // transcript が registry 越しに共有されていれば、runner1/runner2 双方の往復が畳み込みに残る
    // （修正前は runner2 生成時に空Mapへリセットされ、ここには "Again" のみで過去の往復は現れない）。
    expect(foldText).toContain("User: Hello");
    expect(foldText).toContain("Assistant: Hi there");
    expect(foldText).toContain("User: Continue");
    expect(foldText).toContain("Assistant: Sure");
  });

  test("A→B→A→Bの交互切替: killは{A:2,B:1}・spawn回数も一致する（レビュー指摘の回帰）", async () => {
    __resetCodexAppServerRegistry();
    const killCounts: Record<"A" | "B", number> = { A: 0, B: 0 };
    const spawnCounts: Record<"A" | "B", number> = { A: 0, B: 0 };

    function makeProcFor(label: "A" | "B", threadId: string, reply: string): FakeProcHandle {
      const f = makeScriptedProc({
        "thread/start": threadStartOk([threadId]),
        "turn/start": turnOk([reply]),
      });
      f.proc.kill = () => { killCounts[label]++; };
      return f;
    }

    const a1 = makeProcFor("A", "a-1", "A1 reply");
    const b1 = makeProcFor("B", "b-1", "B1 reply");
    const a2 = makeProcFor("A", "a-2", "A2 reply");
    const b2 = makeProcFor("B", "b-2", "B2 reply");

    function cfgFor(label: "A" | "B", proc: FakeProcHandle): CodexAppServerConfig {
      const model = label === "A" ? "gpt-a" : "gpt-b";
      return { ...CFG, model, spawn: () => { spawnCounts[label]++; return proc.proc; } };
    }

    // A → B → A → B の順に切り替える（各回、実際にターンを打って ensureStarted/spawn を確定させる）。
    await getCodexAppServerRunner(cfgFor("A", a1))("t1");
    await getCodexAppServerRunner(cfgFor("B", b1))("t2");
    await getCodexAppServerRunner(cfgFor("A", a2))("t3");
    await getCodexAppServerRunner(cfgFor("B", b2))("t4");

    // A→B, B→A, A→B の3回の切替で: A(a1)がB切替時にkill、B(b1)がA切替時にkill、A(a2)がB切替時にkill。
    // 最後に生き残る b2 はこのシーケンス内では kill されない。
    expect(killCounts).toEqual({ A: 2, B: 1 });
    expect(spawnCounts).toEqual({ A: 2, B: 2 });
  });
});

describe("isTestedCodexVersion", () => {
  test("動作確認済みバージョンと完全一致すればtrue", () => {
    expect(isTestedCodexVersion(TESTED_CODEX_VERSION)).toBe(true);
  });

  test("末尾に改行等が付く実際のCLI出力を許容する", () => {
    expect(isTestedCodexVersion(`${TESTED_CODEX_VERSION}\n`)).toBe(true);
  });

  test("実際の`codex --version`出力形式（`codex-cli <version>`）を許容する", () => {
    // 実機の `codex --version` は "codex-cli 0.142.5" 形式（name + 空白 + version）で出力される。
    // checkCodexVersionOnce はこの生出力を trim() しただけで isTestedCodexVersion に渡すため、
    // ここでこの形式のまま一致判定できることを担保する。
    expect(isTestedCodexVersion(`codex-cli ${TESTED_CODEX_VERSION}`)).toBe(true);
    expect(isTestedCodexVersion(`codex-cli ${TESTED_CODEX_VERSION}\n`)).toBe(true);
  });

  test("前方一致だがパッチバージョンが異なるものはfalse（境界チェック）", () => {
    expect(isTestedCodexVersion(`${TESTED_CODEX_VERSION}0`)).toBe(false); // "0.142.50"
    expect(isTestedCodexVersion(`codex-cli ${TESTED_CODEX_VERSION}0`)).toBe(false);
  });

  test("異なるバージョンはfalse", () => {
    expect(isTestedCodexVersion("0.999.0")).toBe(false);
    expect(isTestedCodexVersion("")).toBe(false);
  });
});
