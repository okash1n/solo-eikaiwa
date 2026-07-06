import { normalizeEn } from "./chunks";
import type { CategoryRate } from "./assessment";
import type { Sentence } from "./sentences";

/**
 * CLI(sentences): 生成対象カテゴリの選定。評価5文以上・bad率>0 のうち bad率降順（同率は reviewed降順）でワースト3。
 * categoryBadRates() は既にこの順で返すが、入力順序に依存しないようここでも明示的にソートする。
 */
export function pickWorstCategories(rates: CategoryRate[], minReviewed = 5, top = 3): CategoryRate[] {
  return rates
    .filter((r) => r.reviewed >= minReviewed && r.badRate > 0)
    .sort((a, b) => b.badRate - a.badRate || b.reviewed - a.reviewed)
    .slice(0, top);
}

export type NewSentenceCandidate = { domain: string; en: string; ja: string; note: string };
const DOMAINS = ["daily", "business", "it"] as const;

/**
 * 生成候補を検証して Sentence[] に整形する。1件でも不正・重複があれば null（全体不採用 → 再生成を促す）。
 * no は既存最大+1 から連番。
 */
export function validateNewSentences(
  cands: unknown,
  existing: Sentence[],
  categoryNo: number,
  category: string,
): Sentence[] | null {
  if (!Array.isArray(cands) || cands.length === 0) return null;
  const norms = new Set(existing.map((s) => normalizeEn(s.en)));
  let no = Math.max(...existing.map((s) => s.no));
  const out: Sentence[] = [];
  for (const raw of cands) {
    const c = raw as NewSentenceCandidate;
    if (typeof c?.en !== "string" || typeof c?.ja !== "string" || typeof c?.note !== "string") return null;
    if (!(DOMAINS as readonly string[]).includes(c.domain)) return null;
    const en = c.en.trim();
    if (!en || en.length > 200) return null;
    const norm = normalizeEn(en);
    if (!norm || norms.has(norm)) return null;
    norms.add(norm);
    no++;
    out.push({
      no, category_no: categoryNo, category,
      domain: c.domain as Sentence["domain"],
      en, ja: c.ja.trim(), note: c.note.trim(),
    });
  }
  return out;
}

export type NewContentCandidate = {
  id: string;
  kind: "topic" | "scenario";
  title: string;
  titleJa: string;
  domain: string;
  level: [number, number];
  hints: string[];
};

/** menu.ts の parseContentFile が読める markdown に整形する（ラウンドトリップをテストで保証） */
export function contentToMarkdown(c: NewContentCandidate): string {
  const heading = c.kind === "topic" ? "Talk about:" : "Roleplay setup:";
  return [
    "---",
    `id: ${c.id}`,
    `kind: ${c.kind}`,
    `title: "${c.title}"`,
    `title_ja: "${c.titleJa}"`,
    `domain: ${c.domain}`,
    `level: [${c.level[0]}, ${c.level[1]}]`,
    "---",
    heading,
    ...c.hints.map((h) => `- ${h}`),
    "",
  ].join("\n");
}
