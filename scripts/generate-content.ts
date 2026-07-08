#!/usr/bin/env bun
/**
 * 実力データ駆動のコンテンツ生成CLI（完全オリジナル教材を追加する）。
 *   bun scripts/generate-content.ts sentences   [--dry]  # SRSの苦手カテゴリに新規例文を各4文追記
 *   bun scripts/generate-content.ts topics      [--dry]  # 現在ステージ向けのお題2本+シナリオ1本を追加
 *   bun scripts/generate-content.ts scenarios   [--dry]  # stage1帯のbusiness/ITロールプレイを1本ずつ生成
 *   bun scripts/generate-content.ts topics-band [--dry]  # stage1帯のbusiness/ITお題を2本ずつ生成
 *   bun scripts/generate-content.ts listening   [--dry]  # 多聴素材を6本（3ドメイン×上下2帯）生成
 * --dry はプレビューのみ（ファイルを書かない）。書き込み前バリデーションに失敗したら何も書かずに終了する。
 * 既定は Claude Agent SDK（サブスクリプション認証）。LLM_PROVIDER で openai-compat / codex に切替可能。
 * チューニング env はこの CLI だけが解釈する（サーバ/UI 経路は env チューニングを一切読まない）:
 *   LLM_PROVIDER=claude（既定）: CLAUDE_MODEL（haiku|sonnet|opus）/ CLAUDE_EFFORT（low|medium|high|xhigh）
 *   LLM_PROVIDER=codex: CODEX_REASONING_EFFORT（low|medium|high|xhigh）/ CODEX_SERVICE_TIER（fast|standard）
 * 恒久教材の生成には LLM_PROVIDER=claude CLAUDE_MODEL=opus CLAUDE_EFFORT=high を推奨。
 * このファイルは依存関係の組み立てだけを行う薄いラッパ。コア生成ロジックは app/server/content-gen.ts。
 */
import { openDb } from "../app/server/db";
import { genSentences, genTopics, genScenarios, genTopicsBand, genListening } from "../app/server/content-gen";
import { resolveCliRunner } from "../app/server/converse";
import { resolveProviderKey } from "../app/server/llm-provider";
import { CLAUDE_MODELS, EFFORTS, SERVICE_TIERS, type RoleTuning } from "../app/server/llm-role-tuning-store";
import { makeProgressStore } from "../app/server/progress-store";
import { stageOf } from "../app/server/progression";
import { SENTENCES_FILE, SCENARIOS_DIR, TOPICS_DIR, LISTENING_DIR } from "../app/server/paths";

const sub = process.argv[2];
const dry = process.argv.includes("--dry");

/** env の選択値を読む。未設定/空白は null（既定に従う）、不正値は許容値を提示して即終了（LLM 呼び出し前）。 */
function envChoice(name: string, allowed: readonly string[]): string | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  if (!allowed.includes(raw)) {
    console.error(`${name}=${raw} は不正です。許容値: ${allowed.join(", ")}（未設定なら既定を使います）`);
    process.exit(1);
  }
  return raw;
}

/**
 * CLI の env チューニング解釈（サーバ/UI と同じホワイトリストで検証）。CLI プロセスの env はこのプロセスの
 * インターフェースなのでここで明示解釈し、resolveCliRunner へ渡す（サーバ経路は env チューニングを読まない）。
 */
function tuningFromEnv(): RoleTuning {
  const provider = resolveProviderKey(process.env);
  if (provider === "" || provider === "claude") {
    return { claudeModel: envChoice("CLAUDE_MODEL", CLAUDE_MODELS), effort: envChoice("CLAUDE_EFFORT", EFFORTS), serviceTier: null };
  }
  if (provider === "codex") {
    return { claudeModel: null, effort: envChoice("CODEX_REASONING_EFFORT", EFFORTS), serviceTier: envChoice("CODEX_SERVICE_TIER", SERVICE_TIERS) };
  }
  // openai-compat 等: 対応するチューニング項目なし（既定継承）
  return { claudeModel: null, effort: null, serviceTier: null };
}

const runner = resolveCliRunner(tuningFromEnv());

async function main(): Promise<void> {
  const db = openDb();
  const stage = stageOf(makeProgressStore(db).getLevel());
  if (sub === "sentences") {
    await genSentences({ runner, sentencesFile: SENTENCES_FILE, db, stage, dry, log: console.log });
  } else if (sub === "topics") {
    await genTopics({ runner, topicsDir: TOPICS_DIR, scenariosDir: SCENARIOS_DIR, stage, dry, log: console.log });
  } else if (sub === "scenarios") {
    await genScenarios({ runner, scenariosDir: SCENARIOS_DIR, dry, log: console.log });
  } else if (sub === "topics-band") {
    await genTopicsBand({ runner, topicsDir: TOPICS_DIR, dry, log: console.log });
  } else if (sub === "listening") {
    await genListening({ runner, listeningDir: LISTENING_DIR, dry, log: console.log });
  } else {
    console.error("使い方: bun scripts/generate-content.ts <sentences|topics|scenarios|topics-band|listening> [--dry]");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
