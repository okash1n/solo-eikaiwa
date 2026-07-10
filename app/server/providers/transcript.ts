/** 1発話分（プロバイダ横断でインメモリ会話履歴を表す共通単位）。 */
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type TranscriptStoreOptions = {
  /** user+assistant の1往復を1 turnとして数える。 */
  maxTurns: number;
  maxTokens: number;
  maxSessions: number;
  ttlMs: number;
  now?: () => number;
  estimateTokens?: (text: string) => number;
  onEvict?: (sessionId: string) => void;
};

const DEFAULT_OPTIONS: TranscriptStoreOptions = {
  maxTurns: 24,
  maxTokens: 8_000,
  maxSessions: 64,
  ttlMs: 30 * 60_000,
};

type SessionEntry = { turns: ChatTurn[]; lastAccess: number };

/** UTF-8 byte数を使う依存なしの保守的なtoken概算。厳密な課金tokenではなく上限管理専用。 */
export function estimateTranscriptTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(new TextEncoder().encode(text).byteLength / 2));
}

/**
 * providerへ再送する一時contextだけを保持する、TTL/LRU付き有界store。
 * 永続イベントログには触れず、履歴を切り詰めたsessionはnative threadの作り直し用に印を付ける。
 */
export class TranscriptStore {
  private readonly entries = new Map<string, SessionEntry>();
  private readonly evicted = new Set<string>();
  private readonly rotations = new Set<string>();
  private readonly maxTurns: number;
  private readonly maxTokens: number;
  private readonly maxSessions: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly estimate: (text: string) => number;
  private readonly onEvict?: (sessionId: string) => void;

  constructor(options: Partial<TranscriptStoreOptions> = {}) {
    const resolved = { ...DEFAULT_OPTIONS, ...options };
    this.maxTurns = Math.max(1, Math.floor(resolved.maxTurns));
    this.maxTokens = Math.max(2, Math.floor(resolved.maxTokens));
    this.maxSessions = Math.max(1, Math.floor(resolved.maxSessions));
    this.ttlMs = Math.max(1, Math.floor(resolved.ttlMs));
    this.now = resolved.now ?? (() => Date.now());
    this.estimate = resolved.estimateTokens ?? estimateTranscriptTokens;
    this.onEvict = resolved.onEvict;
  }

  get size(): number {
    this.pruneExpired();
    return this.entries.size;
  }

  has(sessionId: string): boolean {
    return this.get(sessionId) !== undefined;
  }

  get(sessionId: string): ChatTurn[] | undefined {
    this.pruneExpired();
    const entry = this.entries.get(sessionId);
    if (!entry) return undefined;
    // delete→setでMap末尾へ動かし、最古entryをLRUとして一定時間で取り出せるようにする。
    this.entries.delete(sessionId);
    entry.lastAccess = this.now();
    this.entries.set(sessionId, entry);
    return entry.turns;
  }

  set(sessionId: string, turns: ChatTurn[]): void {
    this.pruneExpired();
    const bounded = this.boundHistory(turns);
    this.entries.delete(sessionId);
    this.entries.set(sessionId, { turns: bounded.turns, lastAccess: this.now() });
    this.evicted.delete(sessionId);
    if (bounded.trimmed) this.rotations.add(sessionId);
    while (this.entries.size > this.maxSessions) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.evict(oldest);
    }
  }

  append(sessionId: string, userText: string, assistantText: string): void {
    const history = this.get(sessionId) ?? [];
    this.set(sessionId, [
      ...history,
      { role: "user", content: userText },
      { role: "assistant", content: assistantText },
    ]);
  }

  delete(sessionId: string): boolean {
    if (!this.entries.has(sessionId)) return false;
    this.evict(sessionId);
    return true;
  }

  end(sessionId: string): void {
    if (!this.delete(sessionId)) this.rememberEvicted(sessionId);
  }

  clear(): void {
    for (const sessionId of [...this.entries.keys()]) this.evict(sessionId);
  }

  tokenCount(sessionId: string): number {
    return (this.get(sessionId) ?? []).reduce((sum, turn) => sum + this.count(turn.content), 0);
  }

  needsRotation(sessionId: string): boolean {
    return this.rotations.has(sessionId);
  }

  markSynchronized(sessionId: string): void {
    this.rotations.delete(sessionId);
  }

  markForRotation(sessionId: string): void {
    if (this.entries.has(sessionId)) this.rotations.add(sessionId);
  }

  wasEvicted(sessionId: string): boolean {
    this.pruneExpired();
    return this.evicted.has(sessionId);
  }

  private pruneExpired(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [sessionId, entry] of this.entries) {
      if (entry.lastAccess > cutoff) continue;
      this.evict(sessionId);
    }
  }

  private evict(sessionId: string): void {
    if (!this.entries.delete(sessionId)) return;
    this.rotations.delete(sessionId);
    this.rememberEvicted(sessionId);
    this.onEvict?.(sessionId);
  }

  private rememberEvicted(sessionId: string): void {
    this.evicted.delete(sessionId);
    this.evicted.add(sessionId);
    const maxTombstones = this.maxSessions * 2;
    while (this.evicted.size > maxTombstones) {
      const oldest = this.evicted.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.evicted.delete(oldest);
    }
  }

  private count(text: string): number {
    if (!text) return 0;
    const estimated = this.estimate(text);
    return Number.isFinite(estimated) ? Math.max(1, Math.ceil(estimated)) : this.maxTokens;
  }

  private boundHistory(input: ChatTurn[]): { turns: ChatTurn[]; trimmed: boolean } {
    let turns = input.slice(-this.maxTurns * 2);
    let trimmed = turns.length !== input.length;
    const total = () => turns.reduce((sum, turn) => sum + this.count(turn.content), 0);
    while (turns.length > 2 && total() > this.maxTokens) {
      turns = turns.slice(2);
      trimmed = true;
    }
    if (total() > this.maxTokens && turns.length > 0) {
      const pair = turns.slice(-2);
      const firstTokens = this.count(pair[0]!.content);
      const secondTokens = pair[1] ? this.count(pair[1].content) : 0;
      let firstBudget = Math.min(firstTokens, Math.max(1, Math.floor(this.maxTokens / 2)));
      let secondBudget = Math.min(secondTokens, this.maxTokens - firstBudget);
      let remaining = this.maxTokens - firstBudget - secondBudget;
      const addFirst = Math.min(remaining, firstTokens - firstBudget);
      firstBudget += addFirst;
      remaining -= addFirst;
      secondBudget += Math.min(remaining, secondTokens - secondBudget);
      turns = pair.map((turn, index) => ({
        ...turn,
        content: this.truncate(turn.content, index === 0 ? firstBudget : secondBudget),
      }));
      trimmed = true;
    }
    return { turns, trimmed };
  }

  private truncate(text: string, tokenBudget: number): string {
    if (this.count(text) <= tokenBudget) return text;
    const chars = Array.from(text);
    let low = 0;
    let high = chars.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.count(chars.slice(0, mid).join("")) <= tokenBudget) low = mid;
      else high = mid - 1;
    }
    return chars.slice(0, low).join("");
  }
}

type TranscriptMap = Map<string, ChatTurn[]> | TranscriptStore;

/** resumeId がstoreに居ればそのまま返し、いなければ新しいUUIDを返す。 */
export function resolveSessionId(store: TranscriptMap, resumeId: string | undefined): string {
  return resumeId && store.has(resumeId) ? resumeId : crypto.randomUUID();
}

/** user/assistant の1往復をstoreへ追記する。 */
export function appendTurn(
  store: TranscriptMap, sessionId: string, userText: string, assistantText: string,
): void {
  if (store instanceof TranscriptStore) {
    store.append(sessionId, userText, assistantText);
    return;
  }
  const history = store.get(sessionId) ?? [];
  store.set(sessionId, [
    ...history,
    { role: "user", content: userText },
    { role: "assistant", content: assistantText },
  ]);
}
