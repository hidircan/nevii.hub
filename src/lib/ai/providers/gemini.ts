/**
 * Google Gemini generateContent + function calling.
 */
import type { LlmPlan, LlmProvider, ToolDescriptor } from "../types";
import type { AgentToolName } from "../../agent/types";
import { isRegisteredTool } from "../../agent";
import { LlmProviderError } from "../config";

export type GeminiConfig = {
  apiKey: string;
  model: string;
  timeoutMs?: number;
};

/**
 * Gemini's `functionDeclarations[].parameters` accepts only a restricted
 * subset of JSON Schema. These are all valid JSON Schema keywords — zod 4's
 * `toJSONSchema()` (see `agent/registry.ts`'s `zodToJsonSchemaLite`) emits
 * `$schema`/`additionalProperties` on every object schema and
 * `propertyNames` on `z.record()` schemas — but Gemini's API rejects a
 * request outright if any of them are present anywhere in `parameters`.
 */
const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set(["$schema", "additionalProperties", "propertyNames"]);

/**
 * Recursively strips Gemini-incompatible keys from a JSON Schema object,
 * without mutating the input. Only ever called for Gemini's own request
 * body — every other provider (`openai-compatible.ts`, `heuristic.ts`)
 * keeps using `ToolDescriptor.inputSchema` exactly as `zodToJsonSchemaLite`
 * produced it.
 */
export function sanitizeSchemaForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeSchemaForGemini(item));
  }
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    result[key] = sanitizeSchemaForGemini(value);
  }
  return result;
}

export function toolsToGemini(tools: ToolDescriptor[]) {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: sanitizeSchemaForGemini(
          t.inputSchema || {
            type: "object",
            properties: {},
          }
        ),
      })),
    },
  ];
}

async function generate(
  cfg: GeminiConfig,
  body: Record<string, unknown>
): Promise<{
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name?: string; args?: Record<string, unknown> };
      }>;
    };
  }>;
  error?: { message?: string };
}> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new LlmProviderError(
        data?.error?.message || `Gemini HTTP ${res.status}`,
        "gemini",
        res.status
      );
    }
    return data;
  } catch (e) {
    if (e instanceof LlmProviderError) throw e;
    throw new LlmProviderError(
      e instanceof Error ? e.message : "Gemini request failed",
      "gemini"
    );
  } finally {
    clearTimeout(timer);
  }
}

function parsePlan(data: Awaited<ReturnType<typeof generate>>): LlmPlan {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const toolCalls: LlmPlan["toolCalls"] = [];
  let text = "";
  for (const p of parts) {
    if (p.functionCall?.name && isRegisteredTool(p.functionCall.name)) {
      toolCalls.push({
        tool: p.functionCall.name as AgentToolName,
        input: p.functionCall.args || {},
      });
    }
    if (p.text) text += p.text;
  }
  return { toolCalls, assistantText: text || undefined };
}

export function createGeminiProvider(cfg: GeminiConfig): LlmProvider {
  return {
    name: "gemini",

    async plan({ messages, tools }) {
      const contents = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      if (!contents.length) {
        contents.push({ role: "user", parts: [{ text: "Merhaba" }] });
      }

      const data = await generate(cfg, {
        systemInstruction: {
          parts: [
            {
              text:
                "You are Nevii Hub school operations assistant. Use function tools when needed. " +
                "Only use provided functions. Reply in the user's language.",
            },
          ],
        },
        contents,
        tools: toolsToGemini(tools),
      });
      return parsePlan(data);
    },

    async narrate({ userMessage, toolResults }) {
      const data = await generate(cfg, {
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  `User asked: ${userMessage}\nTool results: ${JSON.stringify(toolResults)}\n` +
                  `Write a clear concise answer.`,
              },
            ],
          },
        ],
      });
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      return text || "İşlem tamamlandı.";
    },

    async streamNarrate(args, onToken) {
      // Gemini streamGenerateContent — simplified: full then chunk for UI smoothness
      const full = await this.narrate(args);
      const chunk = 12;
      for (let i = 0; i < full.length; i += chunk) {
        const part = full.slice(i, i + chunk);
        onToken(part);
      }
      return full;
    },
  };
}
