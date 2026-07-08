/**
 * 話し言葉系の生成プロンプトへ注入する共通スタイル指示。
 * 監査(docs/superpowers/plans/2026-07-09-spoken-register-pack.md)が指摘した
 * 「短縮形0%の教科書調」「上級帯 平均17.8〜19.4語/文のエッセイ調」を防ぐための共通ブロック。
 */

export type SpokenBand = "beginner" | "intermediate" | "advanced";

export const SPOKEN_STYLE_BLOCK =
  "Spoken-register style: use contractions by default (I'm, don't, it's, we've, that's, can't) — this text will be spoken aloud and listened to, not read as writing. " +
  'Keep it sounding like natural talk, not an essay: do not use written-register connectors like "moreover", "furthermore", "therefore", "in addition", or "utilize" — use "so", "and", "plus", or "but" instead. ' +
  "Do not use bullet points, numbered lists, or headings inside the spoken text — write it as continuous natural speech.";

const LENGTH_CAP_BY_BAND: Record<SpokenBand, string> = {
  beginner:
    "Keep sentences short and simple: mostly 6-10 words, one idea per sentence. " +
    "Simple vocabulary does NOT mean formal style: contractions (I'm, it's, don't, that's, we've) are mandatory even at this level — " +
    'writing "I am" / "do not" / "it is" throughout turns this into a textbook, not natural speech. ' +
    "Use a contraction in at least one of every three sentences (aim for one in every two).",
  intermediate: "Keep sentences short: mostly 9-13 words per sentence.",
  advanced:
    "Even at this level, keep sentences short for natural speech: mostly 10-15 words — split a long idea into two short sentences instead of chaining clauses with commas.",
};

/** SPOKEN_STYLE_BLOCK に帯別の文長ガイドを足して返す（多聴のような長文生成向け） */
export function spokenStyleFor(band: SpokenBand): string {
  return `${SPOKEN_STYLE_BLOCK} ${LENGTH_CAP_BY_BAND[band]}`;
}
