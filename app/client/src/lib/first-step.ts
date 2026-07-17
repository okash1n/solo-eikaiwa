/**
 * ホーム「迷ったら、これから（任意）」の第一提案（#229 拡張4）。
 * 復習期限が来ている暗記例文・マイフレーズが1枚以上ある日は暗記例文の復習を先に提案し、
 * 0枚の日・取得に失敗した日は従来どおり音読ウォームアップへフォールバックする。
 * 提案はあくまで情報表示 — どのカードから始めるかは利用者の自由（binding制約: 情報的フィードバックのみ）。
 */
export type FirstStep =
  | { kind: "sentences"; dueCount: number }
  | { kind: "warmup" };

/** due数が不明（null）・0枚・不正値のときは常にウォームアップ提案へ安全に倒す。 */
export function recommendFirstStep(dueCount: number | null): FirstStep {
  if (dueCount !== null && Number.isFinite(dueCount) && dueCount >= 1) {
    return { kind: "sentences", dueCount: Math.floor(dueCount) };
  }
  return { kind: "warmup" };
}
