export const SENTENCE_SETTING_TIMING = {
  hideNote: "current",
  audioFirst: "next",
  newPerDay: "reload",
} as const;

/** 新しい出題件数は、現在のキューを明示的に読み直すまで保留する。 */
export function needsPracticeReload(selectedNewPerDay: number, queueNewPerDay: number): boolean {
  return selectedNewPerDay !== queueNewPerDay;
}
