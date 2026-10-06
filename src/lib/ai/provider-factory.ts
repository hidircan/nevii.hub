import type { LlmProvider } from "./types";
import { getProviderConfig, resolveChainProviderConfig } from "./config";
import { heuristicProvider } from "./providers/heuristic";
import { createOpenAiCompatibleProvider } from "./providers/openai-compatible";
import { createGeminiProvider } from "./providers/gemini";
import { createClaudeProvider } from "./providers/claude";
import { createCloudflareWorkersAiProvider } from "./providers/cloudflare-workers-ai";
import type { ProviderId } from "./provider-chain";

/**
 * Resolve production LLM provider from environment.
 * Falls back to heuristic when no API key is configured.
 */
export function getLlmProvider(): LlmProvider {
  const cfg = getProviderConfig();

  try {
    if (
      cfg.name === "openai" ||
      cfg.name === "grok" ||
      cfg.name === "local" ||
      cfg.name === "groq" ||
      cfg.name === "cerebras" ||
      cfg.name === "nvidiaNim"
    ) {
      if (!cfg.apiKey || !cfg.baseUrl) return heuristicProvider;
      return createOpenAiCompatibleProvider({
        name: cfg.name,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        timeoutMs: cfg.timeoutMs,
      });
    }

    if (cfg.name === "claude") {
      if (!cfg.apiKey) return heuristicProvider;
      return createClaudeProvider({
        apiKey: cfg.apiKey,
        model: cfg.model,
        timeoutMs: cfg.timeoutMs,
      });
    }

    if (cfg.name === "gemini") {
      if (!cfg.apiKey) return heuristicProvider;
      return createGeminiProvider({
        apiKey: cfg.apiKey,
        model: cfg.model,
        timeoutMs: cfg.timeoutMs,
      });
    }
  } catch {
    return heuristicProvider;
  }

  return heuristicProvider;
}

export function describeActiveProvider(): { name: string; model: string } {
  const cfg = getProviderConfig();
  return { name: cfg.name, model: cfg.model };
}

/**
 * Resolves ONE specific provider-chain member (`PROVIDER_CHAIN` in
 * `provider-chain.ts`) to a real `LlmProvider`, using its OWN dedicated env
 * vars (`resolveChainProviderConfig`) — distinct from `getLlmProvider()`
 * above, which picks a single global provider for the chat orchestrator.
 *
 * Returns `null` when `id` is a real external provider that isn't
 * configured (missing API key/env) — callers (`provider-bridge.ts`) treat
 * `null` as "skip to the next provider in the chain," never as a silent
 * fallback baked in here. `"heuristic"` always resolves.
 */
export function resolveLiveProvider(id: ProviderId): LlmProvider | null {
  const cfg = resolveChainProviderConfig(id);
  if (!cfg.configured) return null;

  switch (cfg.id) {
    case "heuristic":
      return heuristicProvider;
    case "claude":
      return createClaudeProvider({ apiKey: cfg.apiKey, model: cfg.model, timeoutMs: cfg.timeoutMs });
    case "gemini":
      return createGeminiProvider({ apiKey: cfg.apiKey, model: cfg.model, timeoutMs: cfg.timeoutMs });
    case "groq":
    case "cerebras":
    case "nvidiaNim":
      return createOpenAiCompatibleProvider({
        name: cfg.id,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        timeoutMs: cfg.timeoutMs,
      });
    case "cloudflareAi":
      return createCloudflareWorkersAiProvider({
        accountId: cfg.accountId,
        apiToken: cfg.apiToken,
        model: cfg.model,
        timeoutMs: cfg.timeoutMs,
      });
  }
}
