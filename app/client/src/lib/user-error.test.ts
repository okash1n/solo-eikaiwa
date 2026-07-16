import { afterEach, describe, expect, test } from "bun:test";
import { extractErrorMessage, serializeClientError } from "../api/http";
import { STR } from "../i18n";
import { formatClientError } from "./user-error";

const realConsoleError = console.error;
afterEach(() => { console.error = realConsoleError; });

describe("利用者向けエラー文", () => {
  test("同じ安定コードを日英で同じ保存操作へ変換し、内部詳細を出さない", () => {
    console.error = () => {};
    const error = serializeClientError(new Error("provider API_KEY=secret-value at /Users/example/private"));
    const en = formatClientError("en", error, "save");
    const ja = formatClientError("ja", error, "save");

    expect(en).toContain("Couldn't save your changes.");
    expect(ja).toContain("変更を保存できませんでした。");
    expect(en).toContain("Reference:");
    expect(ja).toContain("参照番号:");
    expect(`${en}\n${ja}`).not.toContain("secret-value");
    expect(`${en}\n${ja}`).not.toContain("/Users/example");
  });

  test("429（STT同時実行の上限等）は混雑の案内になり、入力確認の文言を出さない", async () => {
    console.error = () => {};
    const marker = await extractErrorMessage(new Response(JSON.stringify({ error: "stt queue full" }), {
      status: 429,
      headers: { "x-request-id": "trace-busy" },
    }));
    const en = formatClientError("en", new Error(marker), "record");
    const ja = formatClientError("ja", new Error(marker), "record");

    expect(en).toContain(STR.en.errors.category.BUSY);
    expect(ja).toContain(STR.ja.errors.category.BUSY);
    expect(en).not.toContain(STR.en.errors.category.VALIDATION);
    expect(ja).not.toContain(STR.ja.errors.category.VALIDATION);
  });
});
