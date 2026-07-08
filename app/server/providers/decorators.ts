/**
 * ClaudeRunner を包むデコレータ群。
 *
 * - withTimeout: runner の呼び出しにタイムアウトを課す。
 * - withFallback: transport 起因の失敗（TransportError）に限り別 runner へフォールバックする。
 *
 * どの runner にどう適用するか（配線）は llm-provider.ts の selectRunner に集約する
 * （claude 経路への適用は Task 8 の resolveClaudeRunner に集約）。
 */
import { TransportError } from "./errors";
import type { ClaudeRunner } from "../converse";

/**
 * runner の呼び出しにタイムアウトを課す。ms 以内に解決/拒否しなければ TransportError で reject する。
 * 元の Promise が後から解決/拒否しても、この関数が返す Promise には影響しない（先に決着した方が勝つ）。
 * タイマーは runner の Promise が解決・拒否どちらで決着しても、外側の Promise を決着させる直前に
 * 必ず clear する（残留させない。タイムアウト側が勝った場合はタイマー自体が既に発火済みなので clear 不要）。
 */
export function withTimeout(runner: ClaudeRunner, ms = 180_000): ClaudeRunner {
  return (prompt, resumeId, opts) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new TransportError(`runner timed out after ${ms}ms`));
      }, ms);

      runner(prompt, resumeId, opts).then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        },
      );
    });
}

/**
 * primary runner が TransportError で reject したときに限り、同一引数 (prompt, resumeId, opts) で
 * fallback runner へ委譲する。TransportError 以外（モデル起因の失敗等）はそのまま rethrow し、
 * fallback は呼ばない。
 * primary の reject は必ず try/await で捕捉してから fallback を呼ぶため、fallback 実行中に
 * primary 側の rejected promise が unhandled rejection として残ることはない。
 */
export function withFallback(primary: ClaudeRunner, fallback: ClaudeRunner): ClaudeRunner {
  return async (prompt, resumeId, opts) => {
    try {
      return await primary(prompt, resumeId, opts);
    } catch (err) {
      if (!(err instanceof TransportError)) throw err;
      console.warn("primary runner unavailable, falling back:", err);
      return fallback(prompt, resumeId, opts);
    }
  };
}
