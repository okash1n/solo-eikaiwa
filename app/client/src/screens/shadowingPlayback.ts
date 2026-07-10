export type ShadowingPlaybackOutcome = "completed" | "stopped" | "failed";

/** 再生の結果を、練習記録と次の表示に分けて決める。停止は失敗として扱わない。 */
export function resolveShadowingPlaybackOutcome(outcome: ShadowingPlaybackOutcome): {
  nextState: "ready";
  validAttempt: boolean;
  showRetry: boolean;
} {
  return {
    nextState: "ready",
    validAttempt: outcome === "completed",
    showRetry: outcome === "failed",
  };
}
