import { makeLatestGeneration } from "./latest-generation";

export type SerialLatestOp<T> = {
  /** 直列化された操作本体の完了。失敗はそのまま呼び出し元へ伝播する。 */
  settled: Promise<T>;
  /** この操作より後に新しい操作が始まっていない場合だけ effect を実行する。 */
  apply: (effect: () => void) => void;
};

/**
 * 複数の入力欄をまたぐ書き込み操作（APIキーの保存・削除等）の調停。
 * - 操作は開始順に1件ずつ実行する。サーバ側の適用順が開始順と一致するため、
 *   後の操作の応答は先の操作の結果を必ず織り込んだ最新snapshotになる。
 * - apply は「最後に開始した操作」の系列だけ効果を反映する。操作後の設定再取得の
 *   応答にも同じガードを通すことで、遅れて返った古い応答が画面状態を巻き戻さない。
 */
export function makeSerialLatestOps(): { begin<T>(operation: () => Promise<T>): SerialLatestOp<T> } {
  const generations = makeLatestGeneration();
  let tail: Promise<unknown> = Promise.resolve();
  return {
    begin(operation) {
      const generation = generations.begin();
      const settled = tail.then(() => operation());
      // 失敗した操作があっても、後続の操作は開始順どおり実行する（失敗は settled 側で扱う）
      tail = settled.then(() => undefined, () => undefined);
      return {
        settled,
        apply(effect) {
          if (generations.isCurrent(generation)) effect();
        },
      };
    },
  };
}
