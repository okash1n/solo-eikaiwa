/**
 * 非2xxレスポンスからエラーメッセージを取り出す。サーバ停止時にプロキシ/ブラウザが
 * 返すHTMLなど非JSONボディでも例外を投げず、`HTTP <status>` にフォールバックする。
 */
export async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // 非JSONボディ（サーバ停止時のエラーページ等）はフォールバックメッセージを使う
  }
  return `HTTP ${res.status}`;
}
