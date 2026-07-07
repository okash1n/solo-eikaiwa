import { extractErrorMessage } from "./http";

export type Settings = { anchor: string };

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`settings failed: ${await extractErrorMessage(res)}`);
  return res.json();
}

export async function saveSettings(s: Settings): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(s),
  });
  if (!res.ok) throw new Error(`settings save failed: ${await extractErrorMessage(res)}`);
}
