import { describe, expect, test } from "bun:test";
import { isDesktopContext, pickRecorderMimeType } from "./audio";

describe("isDesktopContext", () => {
  test("UAにsolo-eikaiwa-desktopマーカーが含まれていればtrue", () => {
    expect(isDesktopContext("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 solo-eikaiwa-desktop")).toBe(true);
  });

  test("通常ブラウザのUA（マーカー無し）はfalse", () => {
    expect(
      isDesktopContext(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe(false);
  });
});

describe("pickRecorderMimeType", () => {
  test("ブラウザ文脈は常にaudio/webm（現行どおり不変）", () => {
    expect(pickRecorderMimeType({ isDesktop: false })).toBe("audio/webm");
    expect(pickRecorderMimeType({ isDesktop: false, isTypeSupported: () => false })).toBe("audio/webm");
  });

  test("デスクトップ文脈でmp4対応ならaudio/mp4を優先する", () => {
    expect(pickRecorderMimeType({ isDesktop: true, isTypeSupported: () => true })).toBe("audio/mp4");
  });

  test("デスクトップ文脈でもmp4非対応ならaudio/webmにフォールバックする", () => {
    expect(
      pickRecorderMimeType({ isDesktop: true, isTypeSupported: (t) => t !== "audio/mp4" }),
    ).toBe("audio/webm");
  });
});
