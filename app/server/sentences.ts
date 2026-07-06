import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { SENTENCES_FILE } from "./paths";

export type Sentence = {
  no: number;
  category_no: number;
  category: string;
  domain: "daily" | "business" | "it";
  en: string;
  ja: string;
  note: string;
};

export type SrsState = { stage: number; due: string; reviews: number };
export type SentenceWithSrs = Sentence & { srs: SrsState | null };
export type Grade = "good" | "soso" | "bad";

export type SentenceStore = {
  list(): SentenceWithSrs[];
  queue(newCount: number, today?: string): SentenceWithSrs[];
  grade(no: number, grade: Grade, today?: string): { no: number; stage: number; due: string } | null;
  /** 例文の詳しい解説キャッシュ。未生成は null */
  getExplanation(no: number): string | null;
  saveExplanation(no: number, text: string, today?: string): void;
  /** 解説生成の入力用。未知の no は undefined */
  find(no: number): Sentence | undefined;
};

/** 固定間隔ラダー（index = stage）。検証済みリサーチ: 均等〜長め固定で十分、拡張間隔に実証優位なし */
export const LADDER = [1, 3, 7, 14, 30, 60] as const;

/** サーバのローカル日付 YYYY-MM-DD（UTC罠回避のため toISOString は使わない） */
export function localYmd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return localYmd(new Date(y, m - 1, d + days));
}

const DOMAINS = ["daily", "business", "it"] as const;

function isValidSentence(x: unknown): x is Sentence {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.no === "number" &&
    typeof s.category_no === "number" &&
    typeof s.category === "string" &&
    (DOMAINS as readonly string[]).includes(s.domain as string) &&
    typeof s.en === "string" && s.en.length > 0 &&
    typeof s.ja === "string" &&
    typeof s.note === "string"
  );
}

/** 例文JSONを読み込む。ファイル欠落は throw（起動時に気づく）。不正項目は警告してスキップ */
export function loadSentences(file: string = SENTENCES_FILE): Sentence[] {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`sentences file is not an array: ${file}`);
  const valid = raw.filter(isValidSentence);
  if (valid.length !== raw.length) {
    console.warn(`[sentences] skipped ${raw.length - valid.length} invalid item(s) in ${file}`);
  }
  return valid;
}

type SrsRow = { no: number; stage: number; due: string; last_grade: string | null; reviews: number };

export function makeSentenceStore(db: Database, sentences: Sentence[]): SentenceStore {
  const byNo = new Map(sentences.map((s) => [s.no, s]));

  function srsMap(): Map<number, SrsState> {
    const rows = db.query<SrsRow, []>("SELECT * FROM sentence_srs").all();
    return new Map(rows.map((r) => [r.no, { stage: r.stage, due: r.due, reviews: r.reviews }]));
  }

  return {
    list() {
      const srs = srsMap();
      return sentences.map((s) => ({ ...s, srs: srs.get(s.no) ?? null }));
    },

    queue(newCount, today = localYmd()) {
      const srs = srsMap();
      const reviews = sentences
        .filter((s) => { const st = srs.get(s.no); return st !== undefined && st.due <= today; })
        .sort((a, b) => {
          const da = srs.get(a.no)!.due, dbb = srs.get(b.no)!.due;
          return da < dbb ? -1 : da > dbb ? 1 : a.no - b.no;
        });
      const fresh = sentences
        .filter((s) => !srs.has(s.no))
        .sort((a, b) => a.no - b.no)
        .slice(0, newCount);
      return [...reviews, ...fresh].map((s) => ({ ...s, srs: srs.get(s.no) ?? null }));
    },

    grade(no, grade, today = localYmd()) {
      if (!byNo.has(no)) return null;
      const row = db.query<SrsRow, [number]>("SELECT * FROM sentence_srs WHERE no = ?").get(no);
      const stage = row?.stage ?? 0;
      let newStage: number;
      let due: string;
      if (grade === "good") {
        newStage = Math.min(stage + 1, LADDER.length - 1);
        due = addDaysYmd(today, LADDER[newStage]);
      } else if (grade === "soso") {
        newStage = stage;
        due = addDaysYmd(today, 1);
      } else {
        newStage = Math.max(stage - 1, 0);
        due = addDaysYmd(today, 1);
      }
      db.run(
        `INSERT INTO sentence_srs (no, stage, due, last_grade, reviews) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(no) DO UPDATE SET stage = excluded.stage, due = excluded.due,
           last_grade = excluded.last_grade, reviews = sentence_srs.reviews + 1`,
        [no, newStage, due, grade],
      );
      return { no, stage: newStage, due };
    },

    getExplanation(no) {
      const row = db.query<{ text: string }, [number]>(
        "SELECT text FROM sentence_explanations WHERE no = ?",
      ).get(no);
      return row?.text ?? null;
    },

    saveExplanation(no, text, today = localYmd()) {
      db.run(
        `INSERT INTO sentence_explanations (no, text, created) VALUES (?, ?, ?)
         ON CONFLICT(no) DO UPDATE SET text = excluded.text, created = excluded.created`,
        [no, text, today],
      );
    },

    find(no) {
      return byNo.get(no);
    },
  };
}
