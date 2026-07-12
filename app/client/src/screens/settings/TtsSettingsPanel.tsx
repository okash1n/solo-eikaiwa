import { useRef } from "react";
import { TTS_PROVIDER_OPTIONS, type TtsProvider, type TtsSettingsView } from "../../api";
import { STR, type Lang } from "../../i18n";
import { Button } from "../../ui/Button";
import {
  detectVoiceProviderKind,
  VOICE_PRESETS,
  VOICE_PRESET_FEMALE_VALUES,
  VOICE_PRESET_MALE_VALUES,
} from "./voice-presets";

type Props = {
  lang: Lang;
  view: TtsSettingsView | null;
  provider: TtsProvider;
  baseUrl: string;
  model: string;
  voice: string;
  openaiModel: string;
  openaiVoice: string;
  disabled: boolean;
  saving: boolean;
  dirty: boolean;
  message: string | null;
  onProviderChange: (value: TtsProvider) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onVoiceChange: (value: string) => void;
  onOpenAiModelChange: (value: string) => void;
  onOpenAiVoiceChange: (value: string) => void;
  onSave: () => void;
  onReset: () => void;
};

export function TtsSettingsPanel(props: Props) {
  const s = STR[props.lang];
  const voiceInputRef = useRef<HTMLInputElement | null>(null);
  const selectedVoice = props.provider === "openai" ? props.openaiVoice : props.voice;
  const officialUnavailable = props.provider === "openai" && !props.view?.openAiKeyConfigured;
  const compatIncomplete = props.provider === "openai-compat" && (!props.baseUrl.trim() || !props.model.trim());
  const voicePreset: "female" | "male" | "custom" = VOICE_PRESET_FEMALE_VALUES.includes(selectedVoice.trim())
    ? "female"
    : VOICE_PRESET_MALE_VALUES.includes(selectedVoice.trim())
    ? "male"
    : "custom";

  function changeVoice(value: string) {
    if (props.provider === "openai") props.onOpenAiVoiceChange(value);
    else props.onVoiceChange(value);
  }

  function applyVoicePreset(kind: "female" | "male") {
    const baseUrl = props.provider === "openai" ? props.view?.defaults.baseUrl ?? "" : props.baseUrl;
    changeVoice(VOICE_PRESETS[detectVoiceProviderKind(baseUrl)][kind]);
  }

  const providerLabel = (provider: TtsProvider) => provider === "say"
    ? s.settings.ttsProviderSay
    : provider === "openai"
    ? s.settings.ttsProviderOpenAi
    : s.settings.ttsProviderCompat;

  return (
    <>
      <hr className="settings-divider" />
      <h3 className="settings-section-title">{s.settings.ttsSection}</h3>
      <div className="text-sm text-muted">{s.settings.ttsDesc}</div>
      <div className="llm-fields stack">
        <label className="llm-field">
          <span className="text-sm text-muted">{s.settings.ttsProviderLabel}</span>
          <select
            className="llm-input"
            value={props.provider}
            disabled={props.disabled || !props.view}
            onChange={(event) => props.onProviderChange(event.target.value as TtsProvider)}
          >
            {TTS_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider} disabled={provider === "openai" && !props.view?.openAiKeyConfigured}>
                {providerLabel(provider)}
              </option>
            ))}
          </select>
        </label>
        <div className="text-sm text-muted">{s.settings.ttsProviderNote}</div>
        {props.provider === "openai" && !props.view?.openAiKeyConfigured && (
          <div className="info-pop">{s.settings.ttsOpenAiKeyRequired}</div>
        )}
        {compatIncomplete && <div className="info-pop">{s.settings.ttsCompatConnectionRequired}</div>}
        {props.provider === "openai-compat" && (
          <label className="llm-field">
            <span className="text-sm text-muted">{s.settings.ttsBaseUrlLabel}</span>
            <input className="llm-input" value={props.baseUrl} placeholder="http://localhost:8880/v1" disabled={props.disabled || !props.view} onChange={(event) => props.onBaseUrlChange(event.target.value)} />
          </label>
        )}
        {props.provider !== "say" && (
          <label className="llm-field">
            <span className="text-sm text-muted">{s.settings.ttsModelLabel}</span>
            <input
              className="llm-input"
              value={props.provider === "openai" ? props.openaiModel : props.model}
              placeholder={props.provider === "openai" ? props.view?.defaults.model ?? "gpt-4o-mini-tts" : s.settings.ttsModelPlaceholder}
              disabled={props.disabled || !props.view}
              onChange={(event) => props.provider === "openai" ? props.onOpenAiModelChange(event.target.value) : props.onModelChange(event.target.value)}
            />
          </label>
        )}
        {props.provider !== "say" && (
          <>
            <div className="llm-field">
              <span className="text-sm text-muted">{s.settings.ttsVoicePresetLabel}</span>
              <div className="lang-toggle" role="group" aria-label={s.settings.ttsVoicePresetLabel}>
                <button className={voicePreset === "female" ? "is-active" : ""} aria-pressed={voicePreset === "female"} disabled={props.disabled || !props.view} onClick={() => applyVoicePreset("female")}>{s.settings.ttsVoiceFemale}</button>
                <button className={voicePreset === "male" ? "is-active" : ""} aria-pressed={voicePreset === "male"} disabled={props.disabled || !props.view} onClick={() => applyVoicePreset("male")}>{s.settings.ttsVoiceMale}</button>
                <button className={voicePreset === "custom" ? "is-active" : ""} aria-pressed={voicePreset === "custom"} disabled={props.disabled || !props.view} onClick={() => voiceInputRef.current?.focus()}>{s.settings.ttsVoiceCustom}</button>
              </div>
              <span className="text-sm text-muted">{s.settings.ttsVoicePresetNote}</span>
            </div>
            <label className="llm-field">
              <span className="text-sm text-muted">{s.settings.ttsVoiceLabel}</span>
              <input ref={voiceInputRef} className="llm-input" value={selectedVoice} placeholder={props.provider === "openai" ? props.view?.defaults.voice ?? "alloy" : s.settings.ttsVoicePlaceholder} disabled={props.disabled || !props.view} onChange={(event) => changeVoice(event.target.value)} />
            </label>
          </>
        )}
      </div>
      <div className="text-sm text-muted">{s.settings.ttsSaveNote}</div>
      <Button variant="primary" loading={props.saving} onClick={props.onSave} disabled={props.disabled || !props.view || !props.dirty || officialUnavailable || compatIncomplete}>
        {props.saving ? s.llm.saving : s.llm.save}
      </Button>
      <div className="text-sm text-muted">{s.settings.ttsResetDescWith(props.view?.defaults.model ?? "gpt-4o-mini-tts", props.view?.defaults.voice ?? "alloy")}</div>
      <Button variant="secondary" onClick={props.onReset} disabled={props.disabled || !props.view}>{s.settings.ttsReset}</Button>
      {props.dirty && <div className="info-pop" role="status">{s.settings.unsavedChanges}</div>}
      {props.message && <div className="info-pop" role="status">{props.message}</div>}
    </>
  );
}
