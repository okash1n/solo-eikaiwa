import { extractErrorMessage } from "./http";

export type MonthlyReport = { id: number; ts: string; ymd: string; text: string };
export type MonthlyReportPreview = MonthlyReport & { preview: string };

export async function fetchLatestMonthlyReport(): Promise<MonthlyReport | null> {
  const res = await fetch("/api/assessment/latest");
  if (!res.ok) throw new Error(`assessment latest failed: ${await extractErrorMessage(res)}`);
  return ((await res.json()) as { report: MonthlyReport | null }).report;
}

export async function fetchMonthlyReportList(): Promise<MonthlyReportPreview[]> {
  const res = await fetch("/api/assessment/list");
  if (!res.ok) throw new Error(`assessment list failed: ${await extractErrorMessage(res)}`);
  return ((await res.json()) as { reports: MonthlyReportPreview[] }).reports;
}

export async function requestMonthlyReport(force = false): Promise<{ report: MonthlyReport; cached: boolean }> {
  const res = await fetch("/api/assessment/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(force ? { force: true } : {}),
  });
  if (!res.ok) throw new Error(`assessment generate failed: ${await extractErrorMessage(res)}`);
  return res.json();
}
