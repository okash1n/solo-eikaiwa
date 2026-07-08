/**
 * 練習カレンダーの濃淡レベル（0=活動なし〜4=最濃）。しきい値の根拠:
 * クイック1本5–10XP / 30分メニュー30XP / フル完走57XP（spec A-1）。
 * 情報表示のみ — レベルを条件に警告・演出を出さないこと（プロダクト制約）。
 */
export function calendarLevel(done: boolean, xp: number | undefined): 0 | 1 | 2 | 3 | 4 {
  const v = xp ?? 0;
  if (v >= 50) return 4;
  if (v >= 20) return 3;
  if (v >= 1) return 2;
  return done ? 1 : 0;
}
