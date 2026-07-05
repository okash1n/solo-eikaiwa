import { useEffect, useRef, useState } from "react";
import { converse, getHealth, sessionEnd, sessionStart, sttUpload, ttsFetch, type Health } from "./api";
import { playBlob, Recorder } from "./audio";

type Turn = { role: "you" | "ai"; text: string };
type Status = "idle" | "recording" | "transcribing" | "thinking" | "speaking" | "error";

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const sessionIdRef = useRef<string | undefined>(undefined);
  const recorderRef = useRef(new Recorder());

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
    sessionStart();
    return () => { if (sessionIdRef.current) sessionEnd(sessionIdRef.current); };
  }, []);

  async function onMainButton() {
    setErrorMsg("");
    if (status === "idle") {
      await recorderRef.current.start();
      setStatus("recording");
      return;
    }
    if (status !== "recording") return;
    try {
      setStatus("transcribing");
      const blob = await recorderRef.current.stop();
      const text = await sttUpload(blob);
      if (!text) { setStatus("idle"); return; }
      setTurns((t) => [...t, { role: "you", text }]);

      setStatus("thinking");
      const { replyText, sessionId } = await converse(text, sessionIdRef.current);
      sessionIdRef.current = sessionId;
      setTurns((t) => [...t, { role: "ai", text: replyText }]);

      setStatus("speaking");
      await playBlob(await ttsFetch(replyText));
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  const label: Record<Status, string> = {
    idle: "🎙 話す（クリックで録音開始）",
    recording: "⏹ 録音中…（クリックで送信）",
    transcribing: "📝 文字起こし中…",
    thinking: "🤔 考え中…",
    speaking: "🔊 再生中…",
    error: "🎙 もう一度話す",
  };

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.2rem" }}>learn-english — M1 walking skeleton</h1>
      {health && !health.ok && (
        <p style={{ color: "crimson" }}>
          依存が不足しています: {JSON.stringify(health)} — `scripts/setup.sh` を実行してください
        </p>
      )}
      {health && health.ok && !health.ttsKey && (
        <p style={{ color: "darkorange" }}>OPENAI_API_KEY 未設定のため TTS は say フォールバックです</p>
      )}
      <div style={{ margin: "1rem 0" }}>
        <button
          onClick={onMainButton}
          disabled={status === "transcribing" || status === "thinking" || status === "speaking"}
          style={{ fontSize: "1.1rem", padding: "0.8rem 1.4rem", cursor: "pointer" }}
        >
          {label[status]}
        </button>
      </div>
      {errorMsg && <p style={{ color: "crimson" }}>{errorMsg}</p>}
      <section>
        {turns.map((t, i) => (
          <p key={i} style={{ whiteSpace: "pre-wrap" }}>
            <strong>{t.role === "you" ? "You" : "AI"}:</strong> {t.text}
          </p>
        ))}
      </section>
    </main>
  );
}
