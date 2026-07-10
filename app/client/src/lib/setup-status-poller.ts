import type { SetupStatus } from "../api/setup";
import { isDownloadActive } from "./whisper-setup";

type Schedule = (callback: () => void, delayMs: number) => () => void;

type SetupStatusPollerOptions = {
  load: () => Promise<SetupStatus>;
  onStatus: (status: SetupStatus) => void;
  onError: () => void;
  intervalMs?: number;
  schedule?: Schedule;
};

const defaultSchedule: Schedule = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => { clearTimeout(timer); };
};

/**
 * Setup statusを逐次取得するライフサイクル管理器。
 *
 * - 完了したrequestだけが次のtimeoutを予約するため、status requestは常に最大1件
 * - stop/acceptごとに世代を進め、unmount後や操作確定前の遅延responseを無視する
 * - acceptはstart/cancel APIの確定responseをpollより優先して適用する
 */
export class SetupStatusPoller {
  private readonly load: () => Promise<SetupStatus>;
  private readonly onStatus: (status: SetupStatus) => void;
  private readonly onError: () => void;
  private readonly intervalMs: number;
  private readonly schedule: Schedule;
  private alive = false;
  private generation = 0;
  private inFlight = false;
  private shouldPoll = false;
  private cancelScheduled: (() => void) | null = null;

  constructor(options: SetupStatusPollerOptions) {
    this.load = options.load;
    this.onStatus = options.onStatus;
    this.onError = options.onError;
    this.intervalMs = options.intervalMs ?? 1_000;
    this.schedule = options.schedule ?? defaultSchedule;
  }

  start() {
    if (this.alive) return;
    this.alive = true;
    this.generation += 1;
    this.shouldPoll = true;
    this.request();
  }

  stop() {
    if (!this.alive) return;
    this.alive = false;
    this.generation += 1;
    this.shouldPoll = false;
    this.clearScheduled();
  }

  /** start/cancel APIのresponseを適用し、それより前に始まったpollを失効させる。 */
  accept(status: SetupStatus) {
    if (!this.alive) return;
    this.generation += 1;
    this.clearScheduled();
    this.shouldPoll = isDownloadActive(status.status);
    this.onStatus(status);
    this.scheduleNext();
  }

  private clearScheduled() {
    this.cancelScheduled?.();
    this.cancelScheduled = null;
  }

  private scheduleNext() {
    if (!this.alive || !this.shouldPoll || this.inFlight || this.cancelScheduled) return;
    this.cancelScheduled = this.schedule(() => {
      this.cancelScheduled = null;
      this.request();
    }, this.intervalMs);
  }

  private request() {
    if (!this.alive || !this.shouldPoll || this.inFlight) return;
    this.inFlight = true;
    const requestGeneration = this.generation;
    let request: Promise<SetupStatus>;
    try {
      request = this.load();
    } catch {
      this.inFlight = false;
      if (this.alive && requestGeneration === this.generation) this.onError();
      this.scheduleNext();
      return;
    }

    void request
      .then((status) => {
        if (!this.alive || requestGeneration !== this.generation) return;
        this.shouldPoll = isDownloadActive(status.status);
        this.onStatus(status);
      }, () => {
        if (this.alive && requestGeneration === this.generation) this.onError();
      })
      .finally(() => {
        this.inFlight = false;
        this.scheduleNext();
      });
  }
}
