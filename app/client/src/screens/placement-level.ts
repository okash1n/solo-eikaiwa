export type PlacementLevelValidation =
  | { valid: true; level: number }
  | { valid: false; reason: "required" | "whole-number" | "range" };

/** レベル測定で任意指定する開始Lvを、送信前に検証する。 */
export function validatePlacementLevel(value: string): PlacementLevelValidation {
  const normalized = value.trim();
  if (!normalized) return { valid: false, reason: "required" };
  if (!/^\d+$/.test(normalized)) return { valid: false, reason: "whole-number" };

  const level = Number(normalized);
  if (!Number.isSafeInteger(level) || level < 1 || level > 999) {
    return { valid: false, reason: "range" };
  }
  return { valid: true, level };
}
