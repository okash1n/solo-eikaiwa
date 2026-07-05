import { useEffect, useRef, useState } from "react";
import { prefetchModelTalkAudio, type ContentItem } from "../api";
import { playBlob, stopPlayback } from "../audio";

type State = "script" | "audio" | "ready" | "playing" | "error";

/** モデルトークをTTSで聞きながら重ねて音読するシャドーイングブロック（知覚ドリル） */
export function ShadowingScreen(props: { topic: ContentItem }) {
  const [state, setState] = useState<State>("script");
  const [text, setText] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const aliveRef = useRef(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      prepare();
    }
    return () => {
      aliveRef.current = false;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function prepare() {
    setErrorMsg("");
    setState("script");
    try {
      const { text: t, blob } = await prefetchModelTalkAudio(props.topic.id, (stage) => {
        if (aliveRef.current) setState(stage);
      });
      if (!aliveRef.current) return;
      setText(t);
      setAudioBlob(blob);
      setState("ready");
    } catch (err) {
      if (!aliveRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  async function play() {
    if (!audioBlob) return;
    setState("playing");
    try {
      await playBlob(audioBlob);
    } catch (err) {
      if (!aliveRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
    if (aliveRef.current) setState("ready");
  }

  return (
    <div>
      <p style={{ color: "#666" }}>
        音声に少し遅れてかぶせるように声に出して繰り返します（シャドーイング）。まず1回聞くだけでもOK。
      </p>
      {state === "script" && <p>✍ コーチがモデルトークを書いています…</p>}
      {state === "audio" && <p>🎙 音声を生成しています…</p>}
      {state === "error" && (
        <p style={{ color: "crimson" }}>
          {errorMsg} <button onClick={prepare}>再試行</button>
        </p>
      )}
      {(state === "ready" || state === "playing") && (
        <div>
          <button onClick={play} disabled={state === "playing"} style={{ padding: "0.6rem 1.2rem" }}>
            {state === "playing" ? "🔊 再生中…" : "▶ 再生（何度でも）"}
          </button>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{text}</p>
        </div>
      )}
    </div>
  );
}
