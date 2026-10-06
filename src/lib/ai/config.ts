/**
 * Centralized LLM provider configuration & errors.
 */
import type { ProviderId } from "./provider-chain";

export type ResolvedProviderConfig = {
  name: "claude" | "openai" | "grok" | "gemini" | "local" | "heuristic" | "groq" | "cerebras" | "nvidiaNim";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs: number;
};

/** Claude için varsayılan model; CLAUDE_MODEL (veya AI_MODEL) ile değiştirilebilir. */
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

/** True for a real, non-blank key/value — env vars set to "" or whitespace count as missing. */
function hasValue(v: string | undefined): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
    public readonly causeDetail?: string
  ) {
    super(message);
    this.name = "LlmProviderError";
  }
}

/**
 * True when a provider failure is an auth/config problem (invalid or
 * missing API key, permission denied) rather than a transient/network
 * error. Message-pattern based FIRST — Gemini returns "API key not valid"
 * as a plain HTTP 400 (`INVALID_ARGUMENT`), not 401/403, so status code
 * alone would miss it; 401/403 are still treated as auth errors on their
 * own for providers that DO use them correctly.
 *
 * Callers (`provider-bridge.ts`) use this to mark a provider unhealthy and
 * skip it going forward, instead of blindly retrying a key that is known
 * to be invalid.
 */
const AUTH_CONFIG_ERROR_PATTERN =
  /api[\s_-]?key\s+not\s+valid|invalid[\s_-]?api[\s_-]?key|api_key_invalid|permission[\s_-]?denied|unauthorized|invalid[\s_-]?x-?api-?key|authentication\s+fail/i;

export function isAuthConfigError(error: unknown): boolean {
  if (error instanceof LlmProviderError) {
    if (error.status === 401 || error.status === 403) return true;
    return AUTH_CONFIG_ERROR_PATTERN.test(error.message);
  }
  if (error instanceof Error) {
    return AUTH_CONFIG_ERROR_PATTERN.test(error.message);
  }
  return false;
}

export function getProviderConfig(): ResolvedProviderConfig {
  const requestedLower = (process.env.AI_PROVIDER || "auto").toLowerCase();
  // "nvidiaNim" is the only mixed-case provider name — recover it after the
  // case-insensitive compare above so AI_PROVIDER=nvidianim/NVIDIANIM/nvidiaNim
  // all resolve, instead of silently falling through to heuristic.
  const requested = requestedLower === "nvidianim" ? "nvidiaNim" : requestedLower;
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60_000);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const xaiKey = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const localUrl = process.env.LOCAL_LLM_URL;
  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const nvidiaNimKey = process.env.NVIDIA_NIM_API_KEY;

  const pick = (name: ResolvedProviderConfig["name"]): ResolvedProviderConfig | null => {
    if (name === "claude" && hasValue(anthropicKey)) {
      return {
        name: "claude",
        model: process.env.AI_MODEL || process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
        apiKey: anthropicKey,
        timeoutMs,
      };
    }
    if (name === "openai" && hasValue(openaiKey)) {
      return {
        name: "openai",
        model: process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
        apiKey: openaiKey,
        timeoutMs,
      };
    }
    if (name === "grok" && hasValue(xaiKey)) {
      return {
        name: "grok",
        model: process.env.AI_MODEL || process.env.GROK_MODEL || "grok-2-latest",
        baseUrl: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
        apiKey: xaiKey,
        timeoutMs,
      };
    }
    if (name === "gemini" && hasValue(geminiKey)) {
      return {
        name: "gemini",
        model: process.env.AI_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
        apiKey: geminiKey,
        timeoutMs,
      };
    }
    if (name === "local" && hasValue(localUrl)) {
      return {
        name: "local",
        model: process.env.AI_MODEL || process.env.LOCAL_LLM_MODEL || "local-model",
        baseUrl: localUrl,
        apiKey: process.env.LOCAL_LLM_KEY || "local",
        timeoutMs,
      };
    }
    if (name === "groq" && hasValue(groqKey)) {
      return {
        name: "groq",
        model: process.env.AI_MODEL || process.env.GROQ_MODEL || "llama-4-scout-17b",
        baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
        apiKey: groqKey,
        timeoutMs,
      };
    }
    if (name === "cerebras" && hasValue(cerebrasKey)) {
      return {
        name: "cerebras",
        model: process.env.AI_MODEL || process.env.CEREBRAS_MODEL || "gpt-oss-120b",
        baseUrl: process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1",
        apiKey: cerebrasKey,
        timeoutMs,
      };
    }
    if (name === "nvidiaNim" && hasValue(nvidiaNimKey)) {
      return {
        name: "nvidiaNim",
        model: process.env.AI_MODEL || process.env.NVIDIA_NIM_MODEL || "nemotron-3-ultra-550b-a55b",
        baseUrl: process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
        apiKey: nvidiaNimKey,
        timeoutMs,
      };
    }
    if (name === "heuristic") {
      return { name: "heuristic", model: "heuristic", timeoutMs };
    }
    return null;
  };

  if (requested !== "auto") {
    return pick(requested as ResolvedProviderConfig["name"]) || {
      name: "heuristic",
      model: "heuristic",
      timeoutMs,
    };
  }

  // auto: Claude → Gemini → Groq → NVIDIA NIM → Cerebras → heuristic (must stay in
  // sync with PROVIDER_CHAIN in provider-chain.ts, which the capability
  // fallback chain in provider-bridge.ts walks). "openai"/"grok"(xAI)/"local"
  // remain selectable via an explicit AI_PROVIDER=... value, but are not part
  // of the auto priority.
  return (
    pick("claude") ||
    pick("gemini") ||
    pick("groq") ||
    pick("nvidiaNim") ||
    pick("cerebras") || { name: "heuristic", model: "heuristic", timeoutMs }
  );
}

/**
 * Chain-aware provider config (distinct from `getProviderConfig()` above,
 * which resolves a SINGLE global provider for the chat orchestrator).
 * `provider-bridge.ts`/`provider-factory.ts` call this once per
 * `ProviderId` in `PROVIDER_CHAIN` to resolve real, per-provider runtime
 * config from dedicated env vars — never a shared/guessed one.
 *
 * Never throws; missing env vars simply resolve to `configured: false` so
 * callers can skip to the next provider in the chain.
 */
export type ChainProviderConfig =
  | { id: "heuristic"; configured: true }
  | { id: "claude" | "gemini"; configured: true; apiKey: string; model: string; timeoutMs: number }
  | {
      id: "groq" | "cerebras" | "nvidiaNim";
      configured: true;
      apiKey: string;
      baseUrl: string;
      model: string;
      timeoutMs: number;
    }
  | { id: "cloudflareAi"; configured: true; accountId: string; apiToken: string; model: string; timeoutMs: number }
  | { id: ProviderId; configured: false };

export function resolveChainProviderConfig(id: ProviderId): ChainProviderConfig {
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 60_000);

  switch (id) {
    case "heuristic":
      return { id, configured: true };

    case "claude": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!hasValue(apiKey)) return { id, configured: false };
      return { id, configured: true, apiKey, model: process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL, timeoutMs };
    }

    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!hasValue(apiKey)) return { id, configured: false };
      return { id, configured: true, apiKey, model: process.env.GEMINI_MODEL || "gemini-2.5-flash", timeoutMs };
    }

    case "groq": {
      const apiKey = process.env.GROQ_API_KEY;
      if (!hasValue(apiKey)) return { id, configured: false };
      return {
        id,
        configured: true,
        apiKey,
        baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
        model: process.env.GROQ_MODEL || "llama-4-scout-17b",
        timeoutMs,
      };
    }

    case "cerebras": {
      const apiKey = process.env.CEREBRAS_API_KEY;
      if (!hasValue(apiKey)) return { id, configured: false };
      return {
        id,
        configured: true,
        apiKey,
        baseUrl: process.env.CEREBRAS_BASE_URL || "https://api.cerebras.ai/v1",
        model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
        timeoutMs,
      };
    }

    case "nvidiaNim": {
      const apiKey = process.env.NVIDIA_NIM_API_KEY;
      if (!hasValue(apiKey)) return { id, configured: false };
      return {
        id,
        configured: true,
        apiKey,
        baseUrl: process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
        model: process.env.NVIDIA_NIM_MODEL || "nemotron-3-ultra-550b-a55b",
        timeoutMs,
      };
    }

    case "cloudflareAi": {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      if (!hasValue(accountId) || !hasValue(apiToken)) return { id, configured: false };
      return {
        id,
        configured: true,
        accountId,
        apiToken,
        model: process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct",
        timeoutMs,
      };
    }
  }
}
