/**
 * 支援情報の開示状態は教材キーに束縛する。設定だけで内容を見せず、現在の教材での
 * 明示操作後にだけ開く。別キーを描画した時点で false になるため、画面再利用時も
 * 次の教材へ開示状態を持ち越さない。
 */
export function isDisclosureOpen(openFor: string | null, currentKey: string): boolean {
  return openFor === currentKey;
}

export function toggleDisclosure(openFor: string | null, currentKey: string): string | null {
  return isDisclosureOpen(openFor, currentKey) ? null : currentKey;
}

/** コンテンツの「英語 — 日本語」ヒントを、最後の区切りで分離する。英語側にも長音ダッシュが
 * 含まれ得るため、先頭ではなく末尾を使う。日本語が無い通常の英語ヒントはそのまま残す。 */
export function splitBilingualHint(hint: string): { en: string; ja?: string } {
  const separator = " — ";
  const index = hint.lastIndexOf(separator);
  if (index <= 0) return { en: hint };
  const ja = hint.slice(index + separator.length);
  if (!/[\u3040-\u30ff\u3400-\u9fff]/u.test(ja)) return { en: hint };
  return { en: hint.slice(0, index), ja };
}

/**
 * 練習モードごとの支援開示契約。生成教材の script と、録音由来の transcript は別概念。
 * 各行は docs/support-disclosure.md の検証表と対応し、回帰テストで全モードを固定する。
 */
export const SUPPORT_DISCLOSURE_POLICY = [
  { surface: "warmup-japanese-hints", initiallyHidden: true, explicitAction: true },
  { surface: "topic-outline-japanese-hints", initiallyHidden: true, explicitAction: true },
  { surface: "four-three-two-japanese-hints", initiallyHidden: true, explicitAction: true },
  { surface: "four-three-two-model-talk-script", initiallyHidden: true, explicitAction: true },
  { surface: "sentence-answer-and-explanation", initiallyHidden: true, explicitAction: true },
  { surface: "listening-script-and-explanation", initiallyHidden: true, explicitAction: true },
  { surface: "shadowing-script-and-explanation", initiallyHidden: true, explicitAction: true },
  { surface: "library-script-and-explanation", initiallyHidden: true, explicitAction: true },
  { surface: "free-talk-translation", initiallyHidden: true, explicitAction: true },
  { surface: "reflection-explanation", initiallyHidden: true, explicitAction: true },
] as const;
