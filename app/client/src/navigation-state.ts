/** セッションはホームから始まる深いフローなので、サイドバーではホームを現在地として示す。 */
export function isHomeNavigationActive(modeKind: string): boolean {
  return modeKind === "start" || modeKind === "session";
}
