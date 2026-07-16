import { afterEach, describe, expect, mock, test } from "bun:test";
import { submitPlacement } from "./placement";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const TASKS = [
  { taskId: "self-intro", transcript: "I am an engineer.", durationSec: 40, wordCount: 4 },
  { taskId: "describe-situation", transcript: "My laptop restarted.", durationSec: 60, wordCount: 3 },
  { taskId: "give-opinion", transcript: "I agree.", durationSec: 35, wordCount: 2 },
];

describe("submitPlacement", () => {
  test("tasks と submissionId を送る（再試行の二重記録防止キー）", async () => {
    let posted: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url, init) => {
      posted = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ stage: 2, startLevel: 13, rationale: "r" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await submitPlacement(TASKS, "placement-client-0001");
    expect(result).toEqual({ stage: 2, startLevel: 13, rationale: "r" });
    expect(posted).toEqual({ tasks: TASKS, submissionId: "placement-client-0001" });
  });
});
