import { describe, expect, test } from "bun:test";
import { initialPhase } from "./practicePhase";

describe("initialPhase", () => {
  test("audioFirst が最優先で listen を返す（clozeDefault に関わらず）", () => {
    expect(initialPhase(true, false)).toBe("listen");
    expect(initialPhase(true, true)).toBe("listen");
  });
  test("audioFirst=false のときは clozeDefault が cloze/prompt を決める（v0.11.0 と同一）", () => {
    expect(initialPhase(false, true)).toBe("cloze");
    expect(initialPhase(false, false)).toBe("prompt");
  });
});
