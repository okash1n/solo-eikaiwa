import { describe, expect, test } from "bun:test";
import type { SetupStatus } from "../api/setup";
import { SetupStatusPoller } from "./setup-status-poller";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

class FakeScheduler {
  private nextId = 1;
  private tasks = new Map<number, () => void>();

  readonly schedule = (callback: () => void) => {
    const id = this.nextId++;
    this.tasks.set(id, callback);
    return () => { this.tasks.delete(id); };
  };

  get pending() { return this.tasks.size; }

  runNext() {
    const next = this.tasks.entries().next().value as [number, () => void] | undefined;
    if (!next) throw new Error("scheduled callback not found");
    this.tasks.delete(next[0]);
    next[1]();
  }
}

function status(value: SetupStatus["status"]): SetupStatus {
  return {
    status: value,
    model: value === "idle" ? null : "small",
    receivedBytes: 0,
    totalBytes: 100,
    error: null,
    resumable: false,
    diskFreeBytes: 1_000,
    models: { "large-v3-turbo": false, small: false },
  };
}

describe("SetupStatusPoller", () => {
  test("stop後に遅延responseがresolveしてもstatus・error・timerを復活させない", async () => {
    const request = deferred<SetupStatus>();
    const scheduler = new FakeScheduler();
    const statuses: SetupStatus[] = [];
    let errors = 0;
    const poller = new SetupStatusPoller({
      load: () => request.promise,
      onStatus: (value) => statuses.push(value),
      onError: () => { errors += 1; },
      schedule: scheduler.schedule,
    });

    poller.start();
    poller.stop();
    request.resolve(status("downloading"));
    await flushPromises();

    expect(statuses).toEqual([]);
    expect(errors).toBe(0);
    expect(scheduler.pending).toBe(0);
  });

  test("cancel確定後は古いactive responseを無視してidleを巻き戻さない", async () => {
    const oldRequest = deferred<SetupStatus>();
    const scheduler = new FakeScheduler();
    const statuses: SetupStatus[] = [];
    const poller = new SetupStatusPoller({
      load: () => oldRequest.promise,
      onStatus: (value) => statuses.push(value),
      onError: () => {},
      schedule: scheduler.schedule,
    });

    poller.start();
    poller.accept(status("idle"));
    oldRequest.resolve(status("downloading"));
    await flushPromises();

    expect(statuses.map((value) => value.status)).toEqual(["idle"]);
    expect(scheduler.pending).toBe(0);
  });

  test("応答完了後にだけ次回を予約し、status requestを常に最大1件にする", async () => {
    const scheduler = new FakeScheduler();
    const requests = [deferred<SetupStatus>(), deferred<SetupStatus>(), deferred<SetupStatus>()];
    let calls = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    const poller = new SetupStatusPoller({
      load: () => {
        const request = requests[calls++];
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        return request.promise.finally(() => { concurrent -= 1; });
      },
      onStatus: () => {},
      onError: () => {},
      schedule: scheduler.schedule,
    });

    poller.start();
    expect(calls).toBe(1);
    expect(scheduler.pending).toBe(0);
    requests[0].resolve(status("downloading"));
    await flushPromises();
    expect(scheduler.pending).toBe(1);

    scheduler.runNext();
    expect(calls).toBe(2);
    poller.accept(status("downloading"));
    expect(scheduler.pending).toBe(0);
    expect(calls).toBe(2);

    requests[1].resolve(status("downloading"));
    await flushPromises();
    expect(scheduler.pending).toBe(1);
    scheduler.runNext();
    expect(calls).toBe(3);
    expect(maxConcurrent).toBe(1);

    poller.stop();
    requests[2].resolve(status("done"));
    await flushPromises();
  });

  test("取得失敗後も逐次timeoutで再試行する", async () => {
    const scheduler = new FakeScheduler();
    const first = deferred<SetupStatus>();
    const second = deferred<SetupStatus>();
    let calls = 0;
    let errors = 0;
    const poller = new SetupStatusPoller({
      load: () => [first.promise, second.promise][calls++],
      onStatus: () => {},
      onError: () => { errors += 1; },
      schedule: scheduler.schedule,
    });

    poller.start();
    first.reject(new Error("offline"));
    await flushPromises();
    expect(errors).toBe(1);
    expect(scheduler.pending).toBe(1);
    scheduler.runNext();
    expect(calls).toBe(2);
    poller.stop();
    second.resolve(status("idle"));
    await flushPromises();
  });
});
