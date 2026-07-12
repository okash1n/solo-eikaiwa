export type VoiceProviderKind = "kokoro" | "openai";

export const VOICE_PRESETS: Record<VoiceProviderKind, { female: string; male: string }> = {
  kokoro: { female: "af_heart", male: "am_michael" },
  openai: { female: "nova", male: "onyx" },
};

export const VOICE_PRESET_FEMALE_VALUES = Object.values(VOICE_PRESETS).map((preset) => preset.female);
export const VOICE_PRESET_MALE_VALUES = Object.values(VOICE_PRESETS).map((preset) => preset.male);

/** baseUrl から音声プロバイダを推定する。 */
export function detectVoiceProviderKind(baseUrl: string): VoiceProviderKind {
  const lower = baseUrl.toLowerCase();
  return lower.includes("8880") || lower.includes("kokoro") ? "kokoro" : "openai";
}
