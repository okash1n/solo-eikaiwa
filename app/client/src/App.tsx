import { useEffect, useRef, useState } from "react";
import { getHealth, sessionEnd, sessionEndKeepalive, sessionStart, type Health } from "./api";
import { FreeTalkScreen } from "./screens/FreeTalkScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { SessionRunner, type MenuSource } from "./screens/SessionRunner";
import { StartScreen, type StartSelection } from "./screens/StartScreen";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";

type Mode = { kind: "start" } | { kind: "free" } | { kind: "session"; source: MenuSource } | { kind: "library" };

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
    else if (sel.type === "library") setMode({ kind: "library" });
    else if (sel.type === "daily") setMode({ kind: "session", source: { type: "daily", minutes: sel.minutes } });
    else setMode({ kind: "session", source: { type: "quick", drill: sel.drill } });
  }

  return (
    <>
      <header className="app-topbar">
        <div className="topbar-inner">
          <h1 className="app-brand"><span className="brand-mark" aria-hidden="true" />learn-english</h1>
          <span className="app-header-spacer" />
          {mode.kind === "session" ? (
            <Button variant="ghost" onClick={() => setMode({ kind: "start" })}>← メニューに戻る</Button>
          ) : (
            <nav className="topbar-nav">
              {mode.kind !== "start" && (
                <Button variant="ghost" onClick={() => setMode({ kind: "start" })}>← 戻る</Button>
              )}
              <Button variant="secondary" onClick={() => setMode({ kind: "free" })}>💬 自由会話</Button>
              <Button variant="secondary" onClick={() => setMode({ kind: "library" })}>📚 ライブラリ</Button>
            </nav>
          )}
        </div>
      </header>
      <main className="app">
      {serverDown && (
        <Banner kind="error">APIサーバに接続できません — `cd app && bun run dev` で起動してください</Banner>
      )}
      {!serverDown && health && !health.ok && (
        <Banner kind="error">依存が不足しています: {JSON.stringify(health)} — `scripts/setup.sh` を実行してください</Banner>
      )}
      {!serverDown && health && health.ok && !health.ttsKey && (
        <Banner kind="warn">OPENAI_API_KEY 未設定のため TTS は say フォールバックです</Banner>
      )}
      {mode.kind === "start" && <StartScreen onSelect={onSelect} />}
      {mode.kind === "session" && (
        <SessionRunner source={mode.source} sessionId={sessionId} onExit={() => setMode({ kind: "start" })} />
      )}
      {mode.kind === "free" && (
        <div className="stack">
          <div className="hero">
            <h2 className="hero-title">自由会話</h2>
            <p className="hero-date">英語でなんでも話しかけてください — 録音ボタンで開始・停止</p>
          </div>
          <FreeTalkScreen />
        </div>
      )}
      {mode.kind === "library" && <LibraryScreen />}
      </main>
    </>
  );
}
