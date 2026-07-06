/**
 * ローカルタイムゾーンの YYYY-MM-DD。UTC の toISOString().slice(0,10) と違い日付境界でずれない。
 * サーバ app/server/dates.ts の localYmd と同一セマンティクス（SRS の due 比較の一致に必要）。
 */
export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
