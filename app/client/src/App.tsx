import { useEffect, useRef, useState } from "react";
import { getHealth, sessionEnd, sessionEndKeepalive, sessionStart, type Health } from "./api";
import { FreeTalkScreen } from "./screens/FreeTalkScreen";
import { SessionRunner, type MenuSource } from "./screens/SessionRunner";
import { StartScreen, type StartSelection } from "./screens/StartScreen";

type Mode = { kind: "start" } | { kind: "free" } | { kind: "session"; source: MenuSource };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "start" });
  // このタブのセッションを識別するUUID。ライフサイクル/ブロック/ラウンドイベントは
  // モードに関わらずすべてこのIDで記録する（converse() が返す会話用sessionIdとは別概念。そちらは変更しない）
  const [sessionId] = useState(() => crypto.randomUUID());
  // StrictMode の開発時二重マウントで session_start が重複記録されないようにする冪等ガード
  const startedRef = useRef(false);

  useEffect(() => {
    getHealth()
      .then((h) => { setHealth(h); setServerDown(false); })
      .catch(() => { setHealth(null); setServerDown(true); });
    if (!startedRef.current) {
      startedRef.current = true;
      sessionStart(sessionId);
    }
    const onPageHide = () => sessionEndKeepalive(sessionId);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      sessionEnd(sessionId);
    };
  }, [sessionId]);

  function onSelect(sel: StartSelection) {
    if (sel.type === "free") setMode({ kind: "free" });
    else if (sel.type === "daily") setMode({ kind: "session", source: { type: "daily", minutes: sel.minutes } });
    else setMode({ kind: "session", source: { type: "quick", drill: sel.drill } });
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.2rem" }}>
        learn-english
        {mode.kind !== "start" && (
          <button
            onClick={() => setMode({ kind: "start" })}
            style={{ marginLeft: "1rem", fontSize: "0.8rem", cursor: "pointer" }}
          >
            ← メニューに戻る
          </button>
        )}
      </h1>
      {serverDown && (
        <p style={{ color: "crimson" }}>
          APIサーバに接続できません — `cd app && bun run dev` で起動してください
        </p>
      )}
      {!serverDown && health && !health.ok && (
        <p style={{ color: "crimson" }}>
          依存が不足しています: {JSON.stringify(health)} — `scripts/setup.sh` を実行してください
        </p>
      )}
      {!serverDown && health && health.ok && !health.ttsKey && (
        <p style={{ color: "darkorange" }}>OPENAI_API_KEY 未設定のため TTS は say フォールバックです</p>
      )}
      {mode.kind === "start" && <StartScreen onSelect={onSelect} />}
      {mode.kind === "session" && (
        <SessionRunner source={mode.source} sessionId={sessionId} onExit={() => setMode({ kind: "start" })} />
      )}
      {mode.kind === "free" && <FreeTalkScreen />}
    </main>
  );
}
