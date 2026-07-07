import { type ProgressSummary, postForSummary } from "./progress";
import { extractErrorMessage } from "./http";

export type PlacementTaskDef = {
  id: string; durationSec: number; instructionEn: string; instructionJa: string; promptText: string;
};
export type PlacementResult = { stage: number; startLevel: number; rationale: string };
export type PlacementLatest = { id: number; ts: string; stage: number; startLevel: number; rationale: string } | null;

export async function fetchPlacementTasks(): Promise<PlacementTaskDef[]> {
  const res = await fetch("/api/placement/tasks");
  if (!res.ok) throw new Error(`placement tasks failed: ${await extractErrorMessage(res)}`);
  return ((await res.json()) as { tasks: PlacementTaskDef[] }).tasks;
}

export async function submitPlacement(
  tasks: Array<{ taskId: string; transcript: string; durationSec: number; wordCount: number }>,
): Promise<PlacementResult> {
  const res = await fetch("/api/placement/submit", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tasks }),
  });
  if (!res.ok) throw new Error(`placement submit failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export function confirmPlacement(accept: boolean, level?: number): Promise<ProgressSummary> {
  return postForSummary("/api/placement/confirm", { accept, level });
}

export async function fetchPlacementLatest(): Promise<PlacementLatest> {
  const res = await fetch("/api/placement/latest");
  if (!res.ok) throw new Error(`placement latest failed: ${await extractErrorMessage(res)}`);
  return ((await res.json()) as { result: PlacementLatest }).result;
}
