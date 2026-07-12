import { SERVICE_TIER_OPTIONS } from "../../api";
import { STR, type Lang } from "../../i18n";
import type { EffectiveResolution, EndpointClassification, RoleTarget } from "../../lib/llm-assignments";

export function endpointLine(lang: Lang, value: EndpointClassification): string {
  const s = STR[lang];
  const label = {
    loopback: s.settings.endpointLoopback,
    lan: s.settings.endpointLan,
    remote: s.settings.endpointRemote,
    invalid: s.settings.endpointInvalid,
  }[value.location];
  return value.origin ? `${label} · ${value.origin}` : label;
}

/** 用途タブの実効provider・送信先・モデル・チューニングを1行で示す。 */
export function effectiveLine(lang: Lang, effective: EffectiveResolution): string {
  const s = STR[lang];
  const providerLabels: Record<RoleTarget, string> = {
    claude: s.settings.targetClaude,
    openai: s.settings.targetOpenAi,
    local: s.settings.targetLocal,
    codex: s.settings.targetCodex,
  };
  const tierLabels: Record<(typeof SERVICE_TIER_OPTIONS)[number], string> = {
    fast: s.settings.tuningTierFast,
    standard: s.settings.tuningTierStandard,
  };
  const model = effective.model.confirmed
    ? effective.model.text
    : s.settings.effectiveUnconfirmedWith(effective.model.cliDefault ? s.settings.cliDefaultLabel : effective.model.text);
  const destination = effective.endpoint ? endpointLine(lang, effective.endpoint) : s.settings.endpointCloudManaged;
  const parts = [`${providerLabels[effective.provider]} · ${destination} · ${model}`];
  if (effective.effort) {
    parts.push(`${s.settings.tuningEffort} ${effective.effort.value === "sdk-standard" ? s.settings.tuningSdkStandard : effective.effort.value}`);
  }
  if (effective.tier) {
    parts.push(`${s.settings.tuningTier} ${tierLabels[effective.tier.value as (typeof SERVICE_TIER_OPTIONS)[number]] ?? effective.tier.value}`);
  }
  return `${s.settings.effectiveLabel} ${parts.join(" · ")}`;
}
