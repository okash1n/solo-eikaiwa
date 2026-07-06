import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Database } from "bun:sqlite";
import { extractJson } from "./coach";
import { makeClaudeRunner, type ClaudeRunner } from "./converse";

export type PlacementTaskDef = {
  id: string;
  durationSec: number;
  instructionEn: string;
  instructionJa: string;
  /** 画面に表示する状況・問いの本文。月次比較のため毎回同一（変更しないこと） */
  promptText: string;
};

/** スペック§6.1: 自己紹介1分 → 状況説明1.5分 → 意見1分（文面は固定・完全オリジナル） */
export const PLACEMENT_TASKS: readonly PlacementTaskDef[] = [
  {
    id: "self-intro",
    durationSec: 60,
    instructionEn: "Introduce yourself: your job and what you have been interested in lately.",
    instructionJa: "自己紹介: 仕事の内容と、最近関心を持っていることを話してください。",
    promptText: "Tell me about your work and something you have been into recently.",
  },
  {
    id: "describe-situation",
    durationSec: 90,
    instructionEn: "Read the situation below, then explain it in your own words in English.",
    instructionJa: "下の状況を読み、自分の言葉で英語で説明してください。",
    promptText:
      "This morning you had an online meeting, but you could not join for the first ten minutes because your laptop kept restarting. You finally joined from your phone, apologized, and asked a colleague to fill you in later. Explain what happened and how you handled it.",
  },
  {
    id: "give-opinion",
    durationSec: 60,
    instructionEn: "Say whether you agree or disagree, with one or two reasons.",
    instructionJa: "賛成か反対かを、理由を1〜2つ添えて述べてください。",
    promptText: "Some people say everyone should work from home most of the week. Do you agree or disagree?",
  },
];

export type PlacementSubmission = { taskId: string; transcript: string; durationSec: number; wordCount: number };
export type PlacementEvaluation = { stage: number; startLevel: number; rationaleJa: string };

/** スペック§6.2: 開始レベルはステージ中央やや下 */
export function startLevelForStage(stage: number): number {
  return (stage - 1) * 10 + 3;
}

const defaultRunner: ClaudeRunner = makeClaudeRunner(query);

/** stage 1..6 ↔ CEFR A2前半〜B2 の話し言葉記述子。プロンプトに明文で埋め込む（スペック§6.2） */
const RUBRIC = `Stage rubric (spoken production, CEFR-informed; stage 1-6):
- Stage 1 (~A2 low): Mostly short phrases and memorized patterns. Long searches for words. Present tense dominates; errors sometimes block understanding. Very little said for the time available.
- Stage 2 (~A2 high): Connected simple sentences with "and / but / because". Can describe work and daily life in plain terms. Errors are frequent but rarely block understanding.
- Stage 3 (~B1 low): Sustains a short monologue with a recognizable beginning and end. Uses past and future forms with partial control. Works around missing words; noticeable pauses.
- Stage 4 (~B1 high): Comfortable narration and explanation with varied connectors. Gives opinions with simple reasons. Occasional self-correction; errors persist but flow is smooth.
- Stage 5 (~B2 low): Clear, detailed descriptions. Develops an argument with supporting points. Good control of common structures; pace is close to natural.
- Stage 6 (~B2): Speaks fluently and spontaneously. Varies phrasing, handles complex sentences mostly accurately, and defends a viewpoint smoothly.`;

const EVAL_SYSTEM = `You are a CEFR-informed speaking assessor for a Japanese adult learner of English.
You receive transcripts of three short spoken tasks (self-introduction, situation explanation, opinion) with objective stats (word count, words per second).
${RUBRIC}
Judge the OVERALL spoken level across all three transcripts. The transcripts come from automatic speech recognition: ignore punctuation and casing; judge range, grammatical control, coherence, and how much the speaker managed to say in the time.
Reply with STRICT JSON only — no markdown fences, no commentary — exactly this shape:
{"stage": <integer 1-6>, "rationaleJa": "<2〜3行の簡潔な日本語。観察された強み・根拠と、次に伸ばすと良い点。責める表現は使わない>"}
Do not use any tools — reply directly with text only.`;

/** 3タスクの評価。LLM出力が不正形状なら null（ルートは502にして再試行を促す） */
export async function evaluatePlacement(
  submissions: PlacementSubmission[],
  runner: ClaudeRunner = defaultRunner,
): Promise<PlacementEvaluation | null> {
  const sections = submissions.map((s) => {
    const def = PLACEMENT_TASKS.find((t) => t.id === s.taskId);
    const density = s.durationSec > 0 ? (s.wordCount / s.durationSec).toFixed(2) : "0.00";
    return [
      `## Task: ${s.taskId}`,
      `Prompt: ${def?.promptText ?? ""}`,
      `Stats: ${s.wordCount} words in ${s.durationSec}s (${density} words/sec)`,
      `Transcript:`,
      s.transcript,
    ].join("\n");
  });
  const { text } = await runner(sections.join("\n\n"), undefined, { systemPrompt: EVAL_SYSTEM });
  const parsed = extractJson<{ stage?: unknown; rationaleJa?: unknown }>(text);
  if (!parsed) return null;
  const { stage, rationaleJa } = parsed;
  if (typeof stage !== "number" || !Number.isInteger(stage) || stage < 1 || stage > 6) return null;
  if (typeof rationaleJa !== "string" || !rationaleJa.trim()) return null;
  return { stage, startLevel: startLevelForStage(stage), rationaleJa };
}

export type PlacementResultRow = { id: number; ts: string; stage: number; startLevel: number; rationale: string };
export type PlacementStore = {
  save(r: { stage: number; startLevel: number; rationale: string; metrics: unknown }): PlacementResultRow;
  latest(): PlacementResultRow | null;
};

type DbRow = { id: number; ts: string; stage: number; start_level: number; rationale: string };

export function makePlacementStore(db: Database): PlacementStore {
  return {
    save(r) {
      const ts = new Date().toISOString();
      db.run(
        "INSERT INTO placement_results (ts, stage, start_level, rationale, metrics) VALUES (?, ?, ?, ?, ?)",
        [ts, r.stage, r.startLevel, r.rationale, JSON.stringify(r.metrics)],
      );
      const row = db.query<{ id: number }, []>("SELECT last_insert_rowid() AS id").get()!;
      return { id: row.id, ts, stage: r.stage, startLevel: r.startLevel, rationale: r.rationale };
    },
    latest() {
      const row = db
        .query<DbRow, []>("SELECT id, ts, stage, start_level, rationale FROM placement_results ORDER BY id DESC LIMIT 1")
        .get();
      if (!row) return null;
      return { id: row.id, ts: row.ts, stage: row.stage, startLevel: row.start_level, rationale: row.rationale };
    },
  };
}
