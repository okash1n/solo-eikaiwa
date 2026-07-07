/** 練習カードのフェーズ。ja→想起の "prompt"、歯抜けの "cloze"、音から始める "listen"、答え合わせの "answer"。 */
export type Phase = "listen" | "prompt" | "cloze" | "answer";

/**
 * カード開始時（および grade 後の次カード）の初期フェーズを決める。
 * 適用は排他で、音から(audioFirst) > 歯抜け(clozeDefault) > 通常(prompt) の優先順。
 * audioFirst=false のときは従来どおり clozeDefault のみで cloze/prompt を決める（挙動契約: v0.11.0 と同一）。
 */
export function initialPhase(audioFirst: boolean, clozeDefault: boolean): Phase {
  if (audioFirst) return "listen";
  return clozeDefault ? "cloze" : "prompt";
}
