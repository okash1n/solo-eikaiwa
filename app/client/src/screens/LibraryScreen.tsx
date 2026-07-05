import { useEffect, useRef, useState } from "react";
import { fetchModelTalkLibrary, playTtsCached, type ModelTalkEntry } from "../api";
import { stopPlayback } from "../audio";

type State = "loading" | "ready" | "error";

/** 生成済みモデルトークの一覧（情報表示のみ）。本文確認と再再生ができる。 */
export function LibraryScreen() {
  const [state, setState] = useState<State>("loading");
  const [entries, setEntries] = useState<ModelTalkEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [playingId, setPlayingId] = useState<number | null>(null);
  const aliveRef = useRef(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      load();
    }
    return () => {
      aliveRef.current = false;
      stopPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setState("loading");
    setErrorMsg("");
    try {
      const list = await fetchModelTalkLibrary();
      if (!aliveRef.current) return;
      setEntries(list);
      setState("ready");
    } catch (err) {
      if (!aliveRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setState("error");
    }
  }

  async function play(entry: ModelTalkEntry) {
    setErrorMsg("");
    setPlayingId(entry.id);
    try {
      await playTtsCached(entry.text);
    } catch (err) {
      if (!aliveRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      if (aliveRef.current) setPlayingId(null);
    }
  }

  return (
    <div>
      <h3>📚 モデルトークライブラリ</h3>
      {state === "loading" && <p>読み込み中…</p>}
      {state === "error" && (
        <p style={{ color: "crimson" }}>
          {errorMsg} <button onClick={load}>再試行</button>
        </p>
      )}
      {state === "ready" && entries.length === 0 && (
        <p style={{ color: "#666" }}>
          まだありません。4/3/2 の準備やシャドーイングでモデルトークを生成すると、ここに残ります。
        </p>
      )}
      {state === "ready" &&
        entries.map((e) => (
          <div key={e.id} style={{ borderTop: "1px solid #ddd", padding: "0.8rem 0" }}>
            <p style={{ margin: 0 }}>
              <button
                onClick={() => play(e)}
                disabled={playingId !== null}
                style={{ marginRight: "0.5rem", cursor: "pointer" }}
              >
                {playingId === e.id ? "🔊 再生中…" : "▶"}
              </button>
              <strong>{e.topicTitle || e.topicId}</strong>{" "}
              <span style={{ color: "#888", fontSize: "0.85rem" }}>{e.createdAt.slice(0, 10)}</span>
            </p>
            <details>
              <summary style={{ cursor: "pointer", color: "#666" }}>本文</summary>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{e.text}</p>
            </details>
          </div>
        ))}
      {state === "ready" && errorMsg && <p style={{ color: "crimson" }}>{errorMsg}</p>}
    </div>
  );
}
