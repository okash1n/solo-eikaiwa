/**
 * デスクトップ(Tauri webview)では target="_blank" の新規ウィンドウ要求が既定で破棄され、
 * さらに配信オリジン(127.0.0.1)にはIPC権限を与えない設計のため shell.open も直接呼べない。
 * そこで外部リンクのクリックを同一フレーム遷移へ変換し、Rust側の on_navigation が
 * システムブラウザで開いて遷移自体は拒否する(画面の状態は保たれる)。
 * このモジュールは委譲クリックリスナーの判定部(純ロジック)のみを持つ。
 */
export function externalBlankHref(href: string | null, target: string | null): string | null {
  if (target !== "_blank" || !href) return null;
  return /^https?:\/\//i.test(href) ? href : null;
}
