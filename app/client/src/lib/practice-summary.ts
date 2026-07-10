type DueTrackedItem = { srs: { due: string } | null };

/** 指定日までに期限が来る例文・チャンクを、同じSRS due基準で合算する。 */
export function countDueByYmd(items: readonly DueTrackedItem[], ymd: string): number {
  return items.filter((item) => item.srs !== null && item.srs.due <= ymd).length;
}
