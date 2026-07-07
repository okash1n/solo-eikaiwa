import { useEffect, useRef, useState } from "react";
import { playTtsCached } from "./api";
import { stopPlayback } from "./audio";

/**
 * リスト各行の🔊再生（テキスト単位TTS）の共通フック。再生中の行キーを保持し、
 * 再生失敗を error 文字列へ整形する。アンマウント時に stopPlayback する。
 * K は行を一意に識別する値の型（例文の no・チャンクの id・チャンクリストの index 等）。
 */
export function usePlayRow<K>(): { playingKey: K | null; error: string; play: (key: K, text: string) => Promise<void> } {
  const [playingKey, setPlayingKey] = useState<K | null>(null);
  const [error, setError] = useState("");
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; stopPlayback(); };
  }, []);
  async function play(key: K, text: string) {
    setError("");
    setPlayingKey(key);
    try {
      await playTtsCached(text);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (aliveRef.current) setPlayingKey(null);
    }
  }
  return { playingKey, error, play };
}
