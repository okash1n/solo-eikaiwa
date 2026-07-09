import { describe, expect, test } from "bun:test";
import { missingDeps } from "./dep-banner";

describe("missingDeps", () => {
  test("health自体がnull（未取得/サーバ未応答）なら空配列", () => {
    expect(missingDeps(null, false)).toEqual([]);
    expect(missingDeps(null, true)).toEqual([]);
  });

  test("旧サーバ応答（フィールド自体が無い＝undefined）では空配列", () => {
    expect(missingDeps({}, false)).toEqual([]);
    expect(missingDeps({}, true)).toEqual([]);
  });

  describe("desktop文脈（Tauri配布アプリ）", () => {
    test("whisper===falseは不足扱い", () => {
      expect(missingDeps({ whisper: false }, true)).toEqual(["whisper"]);
    });

    test("ffmpeg===falseは不足扱いしない（mp4録音+afconvert経路で賄うため同梱不要）", () => {
      expect(missingDeps({ whisper: true, ffmpeg: false }, true)).toEqual([]);
    });

    test("claude===falseは不足扱いしない（llm-notice.tsが情報的トーンで担当済み）", () => {
      expect(missingDeps({ whisper: true, claude: false }, true)).toEqual([]);
    });

    test("modelFile===falseでも不足扱いしない（SetupBannerが専任担当）", () => {
      const health = { whisper: true, ffmpeg: true, claude: true, modelFile: false, ok: false };
      expect(missingDeps(health, true)).toEqual([]);
    });
  });

  describe("dev/browser文脈", () => {
    test("ffmpeg===falseは不足扱い", () => {
      expect(missingDeps({ whisper: true, ffmpeg: false, claude: true }, false)).toEqual(["ffmpeg"]);
    });

    test("複数不足は列挙する", () => {
      expect(missingDeps({ whisper: false, ffmpeg: false, claude: false }, false))
        .toEqual(["whisper", "ffmpeg", "claude"]);
    });

    test("modelFile===falseは不足扱いしない（SetupBannerが専任担当）", () => {
      const health = { whisper: true, ffmpeg: true, claude: true, modelFile: false, ok: false };
      expect(missingDeps(health, false)).toEqual([]);
    });
  });
});
