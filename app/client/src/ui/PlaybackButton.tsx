import type { ReactNode } from "react";
import { Button } from "./Button";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/** 音声の待機・再生中を同じ位置で切り替え、再生中は必ず停止操作を出す。 */
export function PlaybackButton({
  playing, onPlay, onStop, playLabel, stopLabel, disabled = false, playAriaLabel,
  playVariant = "ghost", stopVariant = "secondary", size = "md",
}: {
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
  playLabel: ReactNode;
  stopLabel: string;
  disabled?: boolean;
  playAriaLabel?: string;
  playVariant?: Variant;
  stopVariant?: Variant;
  size?: "md" | "lg";
}) {
  return (
    <Button
      variant={playing ? stopVariant : playVariant}
      size={size}
      onClick={playing ? onStop : onPlay}
      disabled={!playing && disabled}
      ariaLabel={playing ? stopLabel : playAriaLabel}
    >
      {playing ? stopLabel : playLabel}
    </Button>
  );
}
