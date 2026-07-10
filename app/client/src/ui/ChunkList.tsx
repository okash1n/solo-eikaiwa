import { PlaybackButton } from "./PlaybackButton";

type Chunk = { en: string; ja?: string };
type AudioProps = {
  onPlay: (i: number, en: string) => void;
  onStop: () => void;
  stopLabel: string;
} | {
  onPlay?: never;
  onStop?: never;
  stopLabel?: never;
};

/** 英文太字＋日本語gloss＋音声スロット。onPlay 省略時は再生ボタンなし。showJa=false で ja gloss を隠す（データは残す） */
export function ChunkList(
  { chunks, playingIdx, onPlay, onStop, stopLabel, showJa = true, playAria }:
  { chunks: Chunk[]; playingIdx: number | null; showJa?: boolean; playAria?: (en: string) => string } & AudioProps,
) {
  const hasAudio = onPlay !== undefined;
  return (
    <ul className={`chunk-list${hasAudio ? "" : " no-audio"}`}>
      {chunks.map((c, i) => (
        <li key={i}>
          {hasAudio && (
            <PlaybackButton
              playing={playingIdx === i}
              onPlay={() => onPlay!(i, c.en)}
              onStop={onStop!}
              disabled={playingIdx !== null}
              playLabel="▶"
              stopLabel={stopLabel!}
              playAriaLabel={playAria ? playAria(c.en) : c.en}
            />
          )}
          <span className="chunk-en">{c.en}</span>
          {showJa && c.ja && <span className="chunk-ja">{c.ja}</span>}
        </li>
      ))}
    </ul>
  );
}
