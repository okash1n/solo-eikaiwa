/** ClaudeRunner のdeadline・fallback合成。 */
import { TransportError } from "./errors";
import type { ClaudeRunner } from "../converse";

const DEFAULT_TIMEOUT_MS = 180_000;

function signalReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("runner cancelled");
  error.name = "AbortError";
  return error;
}

/**
 * runnerへAbortSignalとmonotonicな絶対deadlineを渡し、期限・呼出元cancelのどちらでも実処理を中断する。
 * 親deadlineがある場合は短い方を採用するため、デコレータを重ねても総時間を延長しない。
 */
export function withTimeout(runner: ClaudeRunner, ms = DEFAULT_TIMEOUT_MS): ClaudeRunner {
  return async (prompt, resumeId, opts = {}) => {
    const controller = new AbortController();
    const ownDeadline = performance.now() + Math.max(0, ms);
    const deadlineAt = Math.min(opts.deadlineAt ?? Number.POSITIVE_INFINITY, ownDeadline);
    const remainingMs = Math.max(0, deadlineAt - performance.now());
    const timeoutError = new TransportError(`runner timed out after ${ms}ms`);
    const onParentAbort = () => controller.abort(signalReason(opts.signal!));
    opts.signal?.addEventListener("abort", onParentAbort, { once: true });
    if (opts.signal?.aborted) controller.abort(signalReason(opts.signal));

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!controller.signal.aborted) {
      if (remainingMs === 0) controller.abort(timeoutError);
      else timer = setTimeout(() => controller.abort(timeoutError), remainingMs);
    }

    const aborted = new Promise<never>((_resolve, reject) => {
      if (controller.signal.aborted) reject(signalReason(controller.signal));
      else controller.signal.addEventListener("abort", () => reject(signalReason(controller.signal)), { once: true });
    });
    const running = controller.signal.aborted
      ? Promise.reject(signalReason(controller.signal))
      : Promise.resolve().then(() => {
        if (controller.signal.aborted) throw signalReason(controller.signal);
        return runner(prompt, resumeId, {
          ...opts,
          signal: controller.signal,
          deadlineAt,
        });
      });

    try {
      return await Promise.race([running, aborted]);
    } catch (error) {
      if (controller.signal.aborted) throw signalReason(controller.signal);
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onParentAbort);
    }
  };
}

/**
 * transport起因の失敗だけfallbackへ委譲する。外側のwithTimeoutがprimary+fallback全体を1つの
 * deadline/AbortSignalで包むため、fallback開始で時間予算がリセットされることはない。
 */
export function withFallback(
  primary: ClaudeRunner, fallback: ClaudeRunner, totalMs = DEFAULT_TIMEOUT_MS,
): ClaudeRunner {
  const combined: ClaudeRunner = async (prompt, resumeId, opts) => {
    try {
      return await primary(prompt, resumeId, opts);
    } catch (error) {
      if (opts?.signal?.aborted || (opts?.deadlineAt !== undefined && performance.now() >= opts.deadlineAt)) {
        throw opts.signal?.aborted ? signalReason(opts.signal) : error;
      }
      if (!(error instanceof TransportError)) throw error;
      console.warn("primary runner unavailable, falling back:", error);
      return fallback(prompt, resumeId, opts);
    }
  };
  return withTimeout(combined, totalMs);
}
