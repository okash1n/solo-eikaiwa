import { fetchModelTalkLibrary } from "../api";
import { useLoad } from "../useLoad";
import { usePlayRow } from "../usePlayRow";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/** 生成済みモデルトークの一覧（情報表示のみ）。本文確認と再再生ができる。 */
export function LibraryScreen() {
  const { state, reload } = useLoad(fetchModelTalkLibrary);
  const row = usePlayRow<number>();

  return (
    <div>
      <h3>📚 モデルトークライブラリ</h3>
      {state.status === "loading" && <p className="text-muted">読み込み中…</p>}
      {state.status === "error" && (
        <Banner kind="error" action={<Button onClick={reload}>再試行</Button>}>{state.error}</Banner>
      )}
      {state.status === "ready" && state.data.length === 0 && (
        <p className="text-muted">
          まだありません。4/3/2 の準備やシャドーイングでモデルトークを生成すると、ここに残ります。
        </p>
      )}
      {state.status === "ready" &&
        state.data.map((e) => (
          <Card
            key={e.id}
            header={
              <>
                <Button
                  variant="ghost"
                  onClick={() => row.play(e.id, e.text)}
                  disabled={row.playingKey !== null}
                  ariaLabel={`「${e.topicTitle || e.topicId}」を再生`}
                >
                  {row.playingKey === e.id ? "🔊 再生中…" : "▶"}
                </Button>{" "}
                {e.topicTitle || e.topicId}{" "}
                <span className="text-sm text-muted">{e.createdAt.slice(0, 10)}</span>
              </>
            }
          >
            <details>
              <summary className="text-muted">本文</summary>
              <p className="reading-text">{e.text}</p>
            </details>
          </Card>
        ))}
      {state.status === "ready" && row.error && <Banner kind="error">{row.error}</Banner>}
    </div>
  );
}
