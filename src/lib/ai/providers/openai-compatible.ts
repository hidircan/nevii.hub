/**
 * OpenAI-compatible Chat Completions (OpenAI, Grok/xAI, local Ollama/vLLM gateways).
 * Uses native function/tool calling when supported; falls back to JSON plan.
 */
import type { LlmPlan, LlmProvider, LlmMessage, ToolDescriptor } from "../types";
import type { AgentToolName } from "../../agent/types";
import { isRegisteredTool } from "../../agent";
import { LlmProviderError, isAuthConfigError } from "../config";
import { withRetry } from "../retry";

export type OpenAiCompatConfig = {
  name: LlmProvider["name"];
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  error?: { message?: string };
};

function toolsToOpenAi(tools: ToolDescriptor[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || {
        type: "object",
        properties: {},
        additionalProperties: true,
      },
    },
  }));
}

async function completeOnce(
  cfg: OpenAiCompatConfig,
  body: Record<string, unknown>
): Promise<ChatCompletionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, temperature: 0.2, ...body }),
      signal: controller.signal,
    });
    const data = (await res.json()) as ChatCompletionResponse;
    if (!res.ok) {
      throw new LlmProviderError(
        data.error?.message || `HTTP ${res.status}`,
        cfg.name,
        res.status,
        JSON.stringify(data).slice(0, 300)
      );
    }
    return data;
  } catch (e) {
    if (e instanceof LlmProviderError) throw e;
    throw new LlmProviderError(
      e instanceof Error ? e.message : "Provider request failed",
      cfg.name
    );
  } finally {
    clearTimeout(timer);
  }
}

async function complete(
  cfg: OpenAiCompatConfig,
  body: Record<string, unknown>
): Promise<ChatCompletionResponse> {
  return withRetry(() => completeOnce(cfg, body), {
    retries: Number(process.env.AI_RETRY_COUNT || 2),
    timeoutMs: (cfg.timeoutMs ?? 60_000) + 5_000,
    label: `${cfg.name}.complete`,
    // An invalid/expired key fails identically on every attempt — retrying
    // burns time and rate-limit budget for a request that can't succeed.
    shouldRetry: (e) => !isAuthConfigError(e),
  });
}

function parseToolCalls(data: ChatCompletionResponse): LlmPlan {
  const msg = data.choices?.[0]?.message;
  const calls = msg?.tool_calls || [];
  if (calls.length) {
    const toolCalls = calls
      .map((c) => {
        const name = c.function?.name || "";
        if (!isRegisteredTool(name)) return null;
        let input: unknown = {};
        try {
          input = JSON.parse(c.function?.arguments || "{}");
        } catch {
          input = {};
        }
        return { tool: name as AgentToolName, input };
      })
      .filter(Boolean) as LlmPlan["toolCalls"];
    return {
      toolCalls,
      assistantText: msg?.content || undefined,
    };
  }

  const content = msg?.content || "";
  try {
    const cleaned = content.replace(/```json|```/g, "").trim();
    const json = JSON.parse(cleaned) as {
      assistantText?: string;
      toolCalls?: Array<{ tool: string; input?: unknown }>;
    };
    return {
      assistantText: json.assistantText,
      toolCalls: (json.toolCalls || [])
        .filter((c) => c?.tool && isRegisteredTool(c.tool))
        .map((c) => ({ tool: c.tool as AgentToolName, input: c.input ?? {} })),
    };
  } catch {
    return { assistantText: content || undefined, toolCalls: [] };
  }
}

export function createOpenAiCompatibleProvider(cfg: OpenAiCompatConfig): LlmProvider {
  return {
    name: cfg.name,

    async plan({ messages, tools }) {
      const data = await complete(cfg, {
        messages: [
          {
            role: "system",
            content:
              "You are NeviiHub, a music school operations assistant. " +
              "Use tools when the user needs school data or actions. " +
              "Only use provided tools. Prefer tools over guessing. " +
              "If no tool is needed, answer helpfully in the user's language (TR/EN).",
          },
          ...messages.map((m) => ({
            role: m.role === "tool" ? "user" : m.role,
            content: m.content,
          })),
        ],
        tools: toolsToOpenAi(tools),
        tool_choice: "auto",
      });
      return parseToolCalls(data);
    },

    async narrate({ userMessage, toolResults }) {
      const data = await complete(cfg, {
        messages: [
          {
            role: "system",
            content:
              "Summarize tool results for a school admin in clear natural language (Turkish if user wrote Turkish). Be concise.",
          },
          {
            role: "user",
            content: `User: ${userMessage}\nResults: ${JSON.stringify(toolResults)}`,
          },
        ],
      });
      return data.choices?.[0]?.message?.content || "İşlem tamamlandı.";
    },

    async streamNarrate({ userMessage, toolResults }, onToken) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 60_000);
      try {
        const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            temperature: 0.2,
            stream: true,
            messages: [
              {
                role: "system",
                content:
                  "Summarize tool results for a school admin in clear natural language. Be concise.",
              },
              {
                role: "user",
                content: `User: ${userMessage}\nResults: ${JSON.stringify(toolResults)}`,
              },
            ],
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text();
          throw new LlmProviderError(
            `Stream failed: ${res.status}`,
            cfg.name,
            res.status,
            text.slice(0, 200)
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const token = json.choices?.[0]?.delta?.content;
              if (token) {
                full += token;
                onToken(token);
              }
            } catch {
              // skip partial
            }
          }
        }
        return full || "İşlem tamamlandı.";
      } catch (e) {
        if (e instanceof LlmProviderError) throw e;
        throw new LlmProviderError(
          e instanceof Error ? e.message : "Stream failed",
          cfg.name
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// silence unused import in type-only path
void (0 as unknown as LlmMessage);
