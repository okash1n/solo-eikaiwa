import { extractErrorMessage } from "./http";

export type DayMetrics = {
  ymd: string; utterances: number; speakingSec: number;
  avgArticulationWpm: number; avgPauseRatio: number; repetitionRatio: number;
};
export type MetricsSummary = {
  days: DayMetrics[];
  level: { current: number; history: Array<{ ymd: string; level: number }> };
};

/** 進捗ダッシュボード用の日別メトリクス集計 */
export async function fetchMetricsSummary(days = 14): Promise<MetricsSummary> {
  const res = await fetch(`/api/metrics/summary?days=${days}`);
  if (!res.ok) throw new Error(`metrics failed: ${await extractErrorMessage(res)}`);
  return res.json();
}
