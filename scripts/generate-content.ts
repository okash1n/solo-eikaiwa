#!/usr/bin/env bun
/**
 * 実力データ駆動のコンテンツ生成CLI（完全オリジナル教材を追加する）。
 *   bun scripts/generate-content.ts sentences [--dry]  # SRSの苦手カテゴリに新規例文を各4文追記
 *   bun scripts/generate-content.ts topics    [--dry]  # 現在ステージ向けのお題2本+シナリオ1本を追加
 * --dry はプレビューのみ（ファイルを書かない）。書き込み前バリデーションに失敗したら何も書かずに終了する。
 * 対話AIは Claude Agent SDK（サブスクリプション認証）を使う。
 */
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { openDb } from "../app/server/db";
import { loadSentences } from "../app/server/sentences";
import { categoryBadRates } from "../app/server/assessment";
import { contentToMarkdown, pickWorstCategories, validateNewSentences, type NewContentCandidate } from "../app/server/content-gen";
import { extractJson } from "../app/server/coach";
import { makeClaudeRunner } from "../app/server/converse";
import { loadContent, parseContentFile } from "../app/server/menu";
import { makeProgressStore } from "../app/server/progress-store";
import { stageOf } from "../app/server/progression";
import { SENTENCES_FILE, SCENARIOS_DIR, TOPICS_DIR } from "../app/server/paths";

const sub = process.argv[2];
const dry = process.argv.includes("--dry");
const runner = makeClaudeRunner(query);

const ORIGINALITY = "All output must be completely original — do not copy or adapt sentences from existing textbooks or courses.";

async function genSentences(): Promise<void> {
  const db = openDb();
  const sentences = loadSentences();
  const worst = pickWorstCategories(categoryBadRates(db, sentences));
  if (worst.length === 0) {
    console.log("データ不足: 評価5文以上で bad が出ているカテゴリがまだありません。例文練習を続けてから再実行してください。");
    return;
  }
  console.log(`苦手カテゴリ: ${worst.map((w) => `${w.category}(bad率${Math.round(w.badRate * 100)}%)`).join(" / ")}`);

  let all = [...sentences];
  for (const w of worst) {
    const inCategory = sentences.filter((s) => s.category_no === w.categoryNo);
    const system = `You write original English example sentences for a Japanese learner (CEFR B1-B2).
Write exactly 4 spoken-register sentences practicing the grammar category "${w.category}".
Domains: one "daily", one "business", one "it", and one of your choice. 6-14 words each. Contractions welcome.
${ORIGINALITY}
Avoid these existing sentences (do not duplicate or closely paraphrase):
${inCategory.slice(0, 12).map((s) => `- ${s.en}`).join("\n")}
Reply with STRICT JSON only: {"sentences":[{"domain":"daily|business|it","en":"...","ja":"自然な和訳","note":"文法ポイント1行(日本語)"}]}
Do not use any tools — reply directly with text only.`;
    let validated = null;
    for (let attempt = 1; attempt <= 2 && !validated; attempt++) {
      const { text } = await runner(`Generate the 4 sentences for category: ${w.category}`, undefined, { systemPrompt: system });
      const parsed = extractJson<{ sentences?: unknown }>(text);
      validated = parsed ? validateNewSentences(parsed.sentences, all, w.categoryNo, w.category) : null;
      if (!validated && attempt === 1) console.log(`  ${w.category}: 検証NG — 再生成します`);
    }
    if (!validated) {
      console.error(`エラー: カテゴリ「${w.category}」の生成が2回とも検証を通りませんでした。何も書き込まずに終了します。`);
      process.exit(1);
    }
    all = [...all, ...validated];
    for (const s of validated) console.log(`  + no.${s.no} [${s.domain}] ${s.en}`);
  }

  if (dry) {
    console.log(`--dry のため書き込みません（追加候補 ${all.length - sentences.length} 文）`);
    return;
  }
  // 書き込み前バリデーション: temp に書いて loadSentences が全件読めることを確認してから本番に書く
  const work = mkdtempSync(path.join(tmpdir(), "gen-sent-"));
  try {
    const tempFile = path.join(work, "sentences.json");
    writeFileSync(tempFile, JSON.stringify(all, null, 2) + "\n");
    const check = loadSentences(tempFile);
    if (check.length !== all.length) {
      console.error(`エラー: 生成物のバリデーションに失敗（${all.length}件中${check.length}件のみ有効）。書き込みを中止します。`);
      process.exit(1);
    }
    writeFileSync(SENTENCES_FILE, JSON.stringify(all, null, 2) + "\n");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`完了: ${all.length - sentences.length} 文を追記しました（計 ${all.length} 文）。`);
  console.log("音声の差分生成: cd app && bun ../scripts/generate-sentence-audio.ts");
}

async function genTopics(): Promise<void> {
  const db = openDb();
  const stage = stageOf(makeProgressStore(db).getLevel());
  const topics = loadContent(TOPICS_DIR);
  const scenarios = loadContent(SCENARIOS_DIR);
  const existingIds = new Set([...topics, ...scenarios].map((c) => c.id));

  const plans: Array<{ kind: "topic" | "scenario"; dir: string }> = [
    { kind: "topic", dir: TOPICS_DIR },
    { kind: "topic", dir: TOPICS_DIR },
    { kind: "scenario", dir: SCENARIOS_DIR },
  ];
  const written: string[] = [];
  for (const p of plans) {
    const existing = (p.kind === "topic" ? topics : scenarios).map((c) => c.id).join(", ");
    const system = `You create one original ${p.kind} for an English speaking practice app (Japanese learner, difficulty stage ${stage} of 6).
${p.kind === "topic"
  ? "A topic gives 4 talking-point hints for a monologue."
  : "A scenario sets up a roleplay: who the AI plays, who the learner is, the goal, and useful moves."}
Each hint line: English phrase — 日本語の補足. Spoken register. ${ORIGINALITY}
Do NOT reuse these existing ids: ${existing}
Reply with STRICT JSON only:
{"id":"kebab-case-id","title":"English title","titleJa":"日本語タイトル","domain":"daily|business|it","level":[min,max],"hints":["English — 日本語", ...4 items]}
level must be within 1..6 and include stage ${stage}.
Do not use any tools — reply directly with text only.`;
    let cand: NewContentCandidate | null = null;
    for (let attempt = 1; attempt <= 2 && !cand; attempt++) {
      const { text } = await runner(`Create the ${p.kind} now.`, undefined, { systemPrompt: system });
      const parsed = extractJson<NewContentCandidate>(text);
      if (!parsed || typeof parsed.id !== "string" || existingIds.has(parsed.id)) { cand = null; continue; }
      const md = contentToMarkdown({ ...parsed, kind: p.kind });
      cand = parseContentFile(md) ? { ...parsed, kind: p.kind } : null;
    }
    if (!cand) {
      console.error(`エラー: ${p.kind} の生成が検証を通りませんでした。ここまでに書いたファイル: ${written.join(", ") || "なし"}`);
      process.exit(1);
    }
    existingIds.add(cand.id);
    const file = path.join(p.dir, `${cand.id}.md`);
    if (existsSync(file)) {
      console.error(`エラー: ${file} は既に存在します。中止します。`);
      process.exit(1);
    }
    console.log(`  + ${p.kind}: ${cand.id} [${cand.domain}/${cand.level[0]}-${cand.level[1]}] ${cand.title}`);
    if (!dry) {
      writeFileSync(file, contentToMarkdown(cand));
      written.push(file);
    }
  }
  console.log(dry ? "--dry のため書き込みません" : `完了: ${written.length} ファイルを追加しました。`);
}

if (sub === "sentences") await genSentences();
else if (sub === "topics") await genTopics();
else {
  console.error("使い方: bun scripts/generate-content.ts <sentences|topics> [--dry]");
  process.exit(1);
}
