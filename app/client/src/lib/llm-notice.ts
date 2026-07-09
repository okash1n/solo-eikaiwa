const KEY = "llmNotice.dismissed";

/**
 * 「Claude/Codex/ローカルLLM未導入だと会話系が動かない」案内バナーの既読フラグ（ブラウザプロファイル単位・localStorage永続）。
 * SentencesScreen の hideNote 等と同じ「明示的に閉じるまで表示し続ける」パターン（自動既読化はしない —
 * ユーザーが実際に閉じた操作だけを「もう見た」とみなす）。
 */
export function isLlmNoticeDismissed(): boolean {
  return localStorage.getItem(KEY) === "1";
}

export function dismissLlmNotice(): void {
  localStorage.setItem(KEY, "1");
}

/**
 * バナー表示条件の純関数（App.tsxから抽出・単体テスト対象）。
 * `health.llmReady === false` で厳密比較する（`!health.llmReady` ではない）: 型上は必須の boolean だが、
 * 実際にはネットワーク境界を越えたJSONであり、旧バージョンのサーバ（このフィールド追加前）が返す
 * health応答には `llmReady` キー自体が存在せず `undefined` になりうる。`!undefined` は `true` になるため
 * 素朴な否定条件だと「旧サーバ＝LLM未導入」という偽の通知が出てしまう（AGENTS.mdが警告する「旧サーバ」
 * シナリオそのもの）。`=== false` なら `undefined`/欠落時は非表示側にフォールバックする（安全側に倒す）。
 */
export function shouldShowLlmNotice(
  health: { llmReady?: boolean } | null,
  dismissed: boolean,
): boolean {
  return health != null && health.llmReady === false && !dismissed;
}
