import { describe, expect, test } from "bun:test";
import { externalBlankHref } from "./external-link";

describe("externalBlankHref(デスクトップの外部リンク横取り判定)", () => {
  test("target=_blank の http(s) リンクは href を返す", () => {
    expect(externalBlankHref("https://github.com/btajp/solo-eikaiwa", "_blank")).toBe(
      "https://github.com/btajp/solo-eikaiwa",
    );
    expect(externalBlankHref("http://example.com/", "_blank")).toBe("http://example.com/");
  });

  test("target が _blank でないリンクは対象外(アプリ内遷移を壊さない)", () => {
    expect(externalBlankHref("https://example.com/", null)).toBeNull();
    expect(externalBlankHref("https://example.com/", "_self")).toBeNull();
  });

  test("http(s) 以外・相対URL・href欠落は対象外", () => {
    expect(externalBlankHref("#/settings", "_blank")).toBeNull();
    expect(externalBlankHref("/privacy.html", "_blank")).toBeNull();
    expect(externalBlankHref("mailto:a@example.com", "_blank")).toBeNull();
    expect(externalBlankHref(null, "_blank")).toBeNull();
  });
});
