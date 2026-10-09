/**
 * Anthropic Claude — Messages API, resmî `@anthropic-ai/sdk` ile.
 *
 * `plan()` agent tool registry'deki araçları Claude tool use olarak sunar;
 * araçları ÇALIŞTIRMAZ (diğer provider'larla aynı sözleşme — çalıştırma
 * Agent Runtime'ın işi). `narrate()`/`streamNarrate()` araç sonuçlarını özetler.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { LlmPlan, LlmProvider, LlmMessage, ToolDescriptor } from "../types";
import type { AgentToolName } from "../../agent/types";
import { isRegisteredTool } from "../../agent";
import { LlmProviderError } from "../config";

export type ClaudeConfig = {
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

type Effort = "low" | "medium" | "high";

const PLAN_SYSTEM =
  "You are NeviiHub, a music school operations assistant. " +
  "Use tools when the user needs school data or actions. " +
  "Only use provided tools. Prefer tools over guessing. " +
  "If no tool is needed, answer helpfully in the user's language (TR/EN).";

const NARRATE_SYSTEM =
  "Summarize tool results for a school admin in clear natural language " +
  "(Turkish if the user wrote Turkish). Be concise.";

/**
 * `output_config.effort` yalnız 5. nesil modellerde var (Haiku 4.5'te 400 döner);
 * sunucu tarafı `fallbacks: "default"` ise yalnız aşağıdaki modellerde
 * kabul ediliyor. CLAUDE_MODEL ile başka bir model seçilirse ikisi de gönderilmez.
 */
const EFFORT_MODEL_PATTERN = /^claude-(opus|sonnet|fable|haiku)-5/;
const SERVER_FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
  "claude-sonnet-5-5",
]);

/** zod `toJSONSchema()` her nesneye `$schema` ekler; tool şemasında gereksiz. */
function toInputSchema(schema: Record<string, unknown> | undefined): Anthropic.Beta.BetaTool.InputSchema {
  if (!schema || schema.type !== "object") return { type: "object", properties: {} };
  const rest = { ...schema };
  delete rest.$schema;
  return rest as Anthropic.Beta.BetaTool.InputSchema;
}

export function toolsToClaude(tools: ToolDescriptor[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: toInputSchema(t.inputSchema),
  }));
}

/**
 * Orchestrator geçmişini Messages API biçimine çevirir: "system" mesajları
 * sistem metnine eklenir, "tool" mesajları kullanıcı turu olur, boş metinler
 * atlanır (API boş içeriği reddeder) ve ilk mesajın "user" olması sağlanır.
 */
export function toClaudeMessages(messages: LlmMessage[]): {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
} {
  const systemParts = [PLAN_SYSTEM];
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    const role = m.role === "assistant" ? "assistant" : "user";
    if (!out.length && role === "assistant") continue;
    out.push({ role, content: m.content });
  }
  if (!out.length) out.push({ role: "user", content: "Merhaba" });
  return { system: systemParts.join("\n\n"), messages: out };
}

function parsePlan(message: Anthropic.Beta.BetaMessage): LlmPlan {
  const toolCalls: NonNullable<LlmPlan["toolCalls"]> = [];
  let text = "";
  for (const block of message.content) {
    if (block.type === "tool_use" && isRegisteredTool(block.name)) {
      toolCalls.push({ tool: block.name as AgentToolName, input: block.input ?? {} });
    } else if (block.type === "text") {
      text += block.text;
    }
  }
  return { toolCalls, assistantText: text || undefined };
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

function toProviderError(e: unknown): LlmProviderError {
  if (e instanceof LlmProviderError) return e;
  if (e instanceof Anthropic.APIError) {
    return new LlmProviderError(e.message, "claude", e.status ?? undefined);
  }
  return new LlmProviderError(e instanceof Error ? e.message : "Claude isteği başarısız oldu.", "claude");
}

/** Güvenlik sınıflandırıcısı reddi HTTP 200 döner — içerik okunmadan yakalanmalı. */
function assertNotRefused(message: Anthropic.Beta.BetaMessage): void {
  if (message.stop_reason === "refusal") {
    throw new LlmProviderError("Claude bu isteği yanıtlamayı reddetti.", "claude");
  }
}

export function createClaudeProvider(cfg: ClaudeConfig): LlmProvider {
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    timeout: cfg.timeoutMs ?? 60_000,
    maxRetries: Number(process.env.AI_RETRY_COUNT || 2),
  });

  const requestControls = (effort: Effort) => ({
    ...(EFFORT_MODEL_PATTERN.test(cfg.model) ? { output_config: { effort } } : {}),
    ...(SERVER_FALLBACK_MODELS.has(cfg.model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
  });

  const narrateRequest = (
    userMessage: string,
    toolResults: Array<{ tool: string; ok: boolean; data?: unknown; error?: string }>
  ) => ({
    model: cfg.model,
    max_tokens: 4096,
    system: NARRATE_SYSTEM,
    messages: [
      {
        role: "user" as const,
        content: `User: ${userMessage}\nResults: ${JSON.stringify(toolResults)}`,
      },
    ],
    ...requestControls("low"),
  });

  return {
    name: "claude",

    async plan({ messages, tools }) {
      const { system, messages: claudeMessages } = toClaudeMessages(messages);
      try {
        const message = await client.beta.messages.create({
          model: cfg.model,
          max_tokens: 16000,
          system,
          messages: claudeMessages,
          ...(tools.length ? { tools: toolsToClaude(tools) } : {}),
          ...requestControls("medium"),
        });
        assertNotRefused(message);
        return parsePlan(message);
      } catch (e) {
        throw toProviderError(e);
      }
    },

    async narrate({ userMessage, toolResults }) {
      try {
        const message = await client.beta.messages.create(narrateRequest(userMessage, toolResults));
        assertNotRefused(message);
        return textOf(message) || "İşlem tamamlandı.";
      } catch (e) {
        throw toProviderError(e);
      }
    },

    async streamNarrate({ userMessage, toolResults }, onToken) {
      try {
        const stream = client.beta.messages.stream(narrateRequest(userMessage, toolResults));
        stream.on("text", (delta) => onToken(delta));
        const message = await stream.finalMessage();
        assertNotRefused(message);
        return textOf(message) || "İşlem tamamlandı.";
      } catch (e) {
        throw toProviderError(e);
      }
    },
  };
}
