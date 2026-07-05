import { query } from "@anthropic-ai/claude-agent-sdk";
import { appendEvent } from "./session-log";
import { sessionLogPath } from "./paths";

export const PARTNER_SYSTEM_PROMPT = `You are an English conversation partner for a Japanese IT professional (CEFR A2-B1).
- You are a friendly colleague. Talk about tech work, identity management, security, AI — or whatever the learner brings up.
- Keep every reply SHORT: 2-4 sentences, then ask ONE follow-up question.
- Use plain, high-frequency English (B1 level). No rare idioms.
- Do NOT correct errors explicitly in this mode; just respond naturally (recast briefly only when meaning is unclear).
- Never switch to Japanese.`;

export type ClaudeRunner = (prompt: string, resumeId?: string) => Promise<{ text: string; sessionId: string }>;

export const runClaudeTurn: ClaudeRunner = async (prompt, resumeId) => {
  let sessionId = resumeId ?? "";
  let text = "";
  for await (const msg of query({
    prompt,
    options: {
      systemPrompt: PARTNER_SYSTEM_PROMPT,
      model: "sonnet",
      allowedTools: [],
      maxTurns: 1,
      ...(resumeId ? { resume: resumeId } : {}),
    },
  })) {
    if (msg.type === "system" && msg.subtype === "init") sessionId = msg.session_id;
    if (msg.type === "result" && msg.subtype === "success") text = msg.result;
  }
  if (!text) throw new Error("Claude returned empty result");
  return { text, sessionId };
};

export async function converseTurn(args: {
  userText: string;
  sessionId?: string;
  runner?: ClaudeRunner;
  logFile?: string;
}): Promise<{ replyText: string; sessionId: string }> {
  const runner = args.runner ?? runClaudeTurn;
  const logFile = args.logFile ?? sessionLogPath(new Date());
  const now = () => new Date().toISOString();

  appendEvent(logFile, {
    ts: now(), type: "user_utterance", sessionId: args.sessionId ?? "pending", text: args.userText,
  });

  const { text, sessionId } = await runner(args.userText, args.sessionId);

  appendEvent(logFile, { ts: now(), type: "assistant_reply", sessionId, text });
  return { replyText: text, sessionId };
}
