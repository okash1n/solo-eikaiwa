import { useEffect, useRef, useState } from "react";
import { getHealth, sessionEnd, sessionEndKeepalive, sessionStart, type Health } from "./api";
import { FreeTalkScreen } from "./screens/FreeTalkScreen";
import { SessionRunner } from "./screens/SessionRunner";
import { StartScreen } from "./screens/StartScreen";

type Mode = "start" | "session60" | "session30" | "free";

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [mode, setMode] = useState<Mode>("start");
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

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.2rem" }}>
        learn-english
        {mode !== "start" && (
          <button
            onClick={() => setMode("start")}
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
      {mode === "start" && <StartScreen onSelect={setMode} />}
      {mode === "session60" && <SessionRunner minutes={60} sessionId={sessionId} onExit={() => setMode("start")} />}
      {mode === "session30" && <SessionRunner minutes={30} sessionId={sessionId} onExit={() => setMode("start")} />}
      {mode === "free" && <FreeTalkScreen />}
    </main>
  );
}
