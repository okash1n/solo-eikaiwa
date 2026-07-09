export type DepHealth = { whisper?: boolean; ffmpeg?: boolean; claude?: boolean } | null;

/**
 * 赤バナー（依存不足エラー）に出すべき「不足している依存」の一覧を返す（空配列＝バナー非表示）。
 * App.tsxから抽出・単体テスト対象（llm-notice.ts / whisper-setup.ts と同じパターン）。
 *
 * - `modelFile` はどちらの文脈でも扱わない（whisper-setup.ts の SetupBanner が専任担当。
 *   赤エラーと緑の案内が同時に出て矛盾するのを避ける）。
 * - desktop（Tauri配布アプリ）文脈: `whisper===false` のみ不足扱いにする（同梱物欠落＝壊れた
 *   インストール）。ffmpeg は同梱不要（audio.ts の mp4 録音 + サーバ側 afconvert 経路で賄うため）。
 *   claude（Claude Code CLI）未導入は llm-notice.ts の情報的バナーが担当済みのためここでは扱わない。
 * - dev/browser 文脈: whisper/ffmpeg/claude の false を従来どおり不足扱いにする（setup.sh 案内が
 *   妥当な相手＝開発者）。
 * - health が null、またはフィールド自体が undefined（旧サーバ応答）の場合は不足扱いにしない
 *   （`=== false` の厳密比較のみ。他の lib/*.ts の shouldShow* と同じ規律）。
 */
export function missingDeps(health: DepHealth, isDesktop: boolean): string[] {
  if (health == null) return [];
  if (isDesktop) {
    return health.whisper === false ? ["whisper"] : [];
  }
  const missing: string[] = [];
  if (health.whisper === false) missing.push("whisper");
  if (health.ffmpeg === false) missing.push("ffmpeg");
  if (health.claude === false) missing.push("claude");
  return missing;
}
