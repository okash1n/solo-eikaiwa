import { describe, expect, test } from "bun:test";
import type { AuthMode, LlmSettingsView, TtsSettingsView } from "../api";
import type { Connection, RoleTargets } from "./llm-assignments";
import {
  authDraftChanged,
  connectionDraftChanged,
  makeSaveGenerationTracker,
  mergeAuthSaveView,
  mergeConnectionSaveView,
  mergeRolesSaveView,
  rolesDraftChanged,
  ttsDraftChanged,
} from "./settings-save-scopes";
import { makeLatestGeneration } from "./latest-generation";

const TARGETS: RoleTargets = {
  conversation: "claude", assist: "claude", coaching: "claude", generation: "claude", assessment: "claude",
};
const LOCAL_CONN: Connection = { baseUrl: "http://localhost:11434/v1", model: "llama3", openaiModel: "", codexModel: "" };

function view(overrides: Partial<LlmSettingsView> = {}): LlmSettingsView {
  return {
    provider: "claude", baseUrl: null, model: null, codexModel: null, apiKeyConfigured: false,
    roles: {
      conversation: { provider: "claude", baseUrl: null, model: null, codexModel: null },
      assist: { provider: "claude", baseUrl: null, model: null, codexModel: null },
      coaching: { provider: "claude", baseUrl: null, model: null, codexModel: null },
      generation: { provider: "claude", baseUrl: null, model: null, codexModel: null },
      assessment: { provider: "claude", baseUrl: null, model: null, codexModel: null },
    },
    globalTuning: { claudeModel: null, effort: null, serviceTier: null },
    tuning: {
      conversation: { claudeModel: null, effort: null, serviceTier: null },
      assist: { claudeModel: null, effort: null, serviceTier: null },
      coaching: { claudeModel: null, effort: null, serviceTier: null },
      generation: { claudeModel: null, effort: null, serviceTier: null },
      assessment: { claudeModel: null, effort: null, serviceTier: null },
    },
    authModes: { claude: "subscription", codex: "subscription" },
    authKeys: { anthropic: false, codex: false },
    ...overrides,
  };
}

describe("settings save scopes", () => {
  test("接続・割当・TTSのdirtyを独立して判定する", () => {
    const savedConnection = {
      connection: LOCAL_CONN, globalClaudeModel: "",
    };
    expect(connectionDraftChanged(savedConnection, savedConnection)).toBe(false);
    expect(connectionDraftChanged(savedConnection, { ...savedConnection, connection: { ...LOCAL_CONN, model: "llama3.1" } })).toBe(true);
    const savedAuth = { claude: "subscription", codex: "subscription" } as Record<"claude" | "codex", AuthMode>;
    expect(authDraftChanged(savedAuth, savedAuth)).toBe(false);
    expect(authDraftChanged(savedAuth, { ...savedAuth, codex: "api-key" })).toBe(true);
    expect(rolesDraftChanged(TARGETS, TARGETS, view().tuning, view().tuning)).toBe(false);
    expect(rolesDraftChanged(TARGETS, { ...TARGETS, assessment: "codex" }, view().tuning, view().tuning)).toBe(true);
    const tts: TtsSettingsView = {
      provider: "openai", baseUrl: null, model: null, voice: null,
      openaiModel: "gpt-4o-mini-tts", openaiVoice: "alloy",
      apiKeyConfigured: false, openAiKeyConfigured: true,
      defaults: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini-tts", voice: "alloy" },
    };
    expect(ttsDraftChanged(tts, "openai", "", "", "", "gpt-4o-mini-tts", "alloy")).toBe(false);
    expect(ttsDraftChanged(tts, "openai", "", "", "", "gpt-4o-mini-tts", "nova")).toBe(true);
  });

  test("接続保存の応答は未保存の割当・チューニングを上書きしない", () => {
    const current = view({
      roles: { ...view().roles, assessment: { provider: "codex", baseUrl: null, model: null, codexModel: "gpt-5" } },
      tuning: { ...view().tuning, assessment: { claudeModel: null, effort: "high", serviceTier: "standard" } },
    });
    const connectionResponse = view({ provider: "openai-compat", baseUrl: LOCAL_CONN.baseUrl, model: LOCAL_CONN.model, codexModel: null });
    const merged = mergeConnectionSaveView(current, connectionResponse);
    expect(merged.baseUrl).toBe(LOCAL_CONN.baseUrl);
    expect(merged.roles.assessment.provider).toBe("codex");
    expect(merged.tuning.assessment.effort).toBe("high");
  });

  test("認証保存の応答は認証状態だけを更新し、接続・用途の編集中stateを守る", () => {
    const current = view({
      provider: "openai-compat", baseUrl: LOCAL_CONN.baseUrl, model: LOCAL_CONN.model,
      roles: { ...view().roles, assessment: { provider: "codex", baseUrl: null, model: null, codexModel: "gpt-5" } },
    });
    const authResponse = view({
      authModes: { claude: "api-key", codex: "subscription" },
      authKeys: { anthropic: true, codex: false },
    });
    const merged = mergeAuthSaveView(current, authResponse);
    expect(merged.authModes.claude).toBe("api-key");
    expect(merged.baseUrl).toBe(LOCAL_CONN.baseUrl);
    expect(merged.roles.assessment.provider).toBe("codex");
  });

  test("割当保存の逆順応答とタブ移動後も接続の新しい値を保持する", () => {
    const base = view();
    const connectionResponse = view({ provider: "openai-compat", baseUrl: LOCAL_CONN.baseUrl, model: LOCAL_CONN.model });
    const rolesResponse = view({
      roles: { ...base.roles, assessment: { provider: "codex", baseUrl: null, model: null, codexModel: "gpt-5" } },
      tuning: { ...base.tuning, assessment: { claudeModel: null, effort: "high", serviceTier: "standard" } },
    });
    const rolesThenConnection = mergeConnectionSaveView(mergeRolesSaveView(base, rolesResponse), connectionResponse);
    const connectionThenRoles = mergeRolesSaveView(mergeConnectionSaveView(base, connectionResponse), rolesResponse);
    for (const merged of [rolesThenConnection, connectionThenRoles]) {
      expect(merged.baseUrl).toBe(LOCAL_CONN.baseUrl);
      expect(merged.roles.assessment.provider).toBe("codex");
      expect(merged.tuning.assessment.effort).toBe("high");
    }
  });

  test("同一スコープで古い保存応答を採用しない", () => {
    const tracker = makeSaveGenerationTracker();
    const first = tracker.begin("connection");
    const second = tracker.begin("connection");
    expect(tracker.isCurrent("connection", first)).toBe(false);
    expect(tracker.isCurrent("connection", second)).toBe(true);
    expect(tracker.isCurrent("auth", tracker.begin("auth"))).toBe(true);
    expect(tracker.isCurrent("roles", tracker.begin("roles"))).toBe(true);
  });

  test("APIキーfieldのSave/Delete交差操作では古いmutation結果を採用しない", () => {
    const generation = makeLatestGeneration();
    const save = generation.begin();
    const remove = generation.begin();
    expect(generation.isCurrent(save)).toBe(false);
    expect(generation.isCurrent(remove)).toBe(true);
  });
});
