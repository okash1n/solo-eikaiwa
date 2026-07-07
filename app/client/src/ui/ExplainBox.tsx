import type { ExplainState } from "../useExplain";
import { Button } from "./Button";

export type ExplainLabels = { more: string; loading: string; error: string; retry: string };

/**
 * useExplain の表示部（idle=ボタン / loading=文言 / error=文言+再試行 / done=本文）を共通化する。
 * 7画面（ListeningScreen・BrowseTab・ReflectionScreen・FourThreeTwoScreen・LibraryScreen・
 * PracticeTab・ShadowingScreen）で重複していたJSXパターンを1箇所に集約。
 * 外部挙動・DOM構造・classNameは各画面の既存実装と同一に保つ。
 */
export function ExplainBox(props: {
  state: ExplainState;
  request: () => void;
  labels: ExplainLabels;
  /** idleボタンの表示に追加ガードが要る画面向け（既定true）。例: FourThreeTwoScreenのAeItemView */
  showIdleButton?: boolean;
}) {
  const { state, request, labels, showIdleButton = true } = props;
  return (
    <>
      {showIdleButton && state.status === "idle" && (
        <Button variant="ghost" onClick={request}>{labels.more}</Button>
      )}
      {state.status === "loading" && <p className="text-sm text-muted">{labels.loading}</p>}
      {state.status === "error" && (
        <p className="text-sm text-muted">{labels.error}<Button variant="ghost" onClick={request}>{labels.retry}</Button></p>
      )}
      {state.status === "done" && <p className="sentence-explain text-sm">{state.text}</p>}
    </>
  );
}
