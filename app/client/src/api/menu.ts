import type { MenuTitleKey } from "../i18n";
import { extractErrorMessage } from "./http";

export type ContentItem = { id: string; kind: "topic" | "scenario"; title: string; titleJa: string; hints: string[]; starters?: string[] };
/** v0.26 wave5: rotation の情報的注記（サーバ rotation.ts の RotationFallback と同じ2値）。無ければ通常選定。 */
export type RotationFallback = "domain-substituted" | "band-relaxed";
export type MenuBlock = {
  id: string; kind: string; title: string;
  titleKey?: MenuTitleKey; topicTitle?: string;
  minutes: number;
  params: { topic?: ContentItem; scenario?: ContentItem; roundsSec?: number[]; modelTalkMode?: "auto" | "button" };
  fallback?: RotationFallback;
};
export type Menu = { minutes: number; date: string; blocks: MenuBlock[] };

export async function fetchMenu(minutes: 60 | 30): Promise<Menu> {
  const res = await fetch(`/api/menu/today?minutes=${minutes}`);
  if (!res.ok) throw new Error(`menu failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export type QuickDrillKind = "warmup" | "ftt-mini" | "roleplay" | "shadowing";
export type RoleplayDomain = "daily" | "business" | "it";

export async function fetchQuickMenu(kind: QuickDrillKind, domain?: RoleplayDomain): Promise<Menu> {
  const q = domain ? `&domain=${domain}` : "";
  const res = await fetch(`/api/menu/quick?kind=${kind}${q}`);
  if (!res.ok) throw new Error(`quick menu failed: ${await extractErrorMessage(res)}`);
  return res.json();
}
