/**
 * Provider chain skeleton — METADATA ONLY. No HTTP/API integration here.
 *
 * Distinct from `provider-factory.ts` (which resolves ONE live `LlmProvider`
 * from env for the chat orchestrator). This module is the policy layer that
 * `capabilities.ts`/`plan-invocation.ts` use to decide which provider a
 * capability *should* prefer, and what to fall back to. Wiring a chosen
 * provider id to a real `LlmProvider` implementation is a later phase.
 */

export type ProviderId =
  | "claude"
  | "gemini"
  | "groq"
  | "cerebras"
  | "nvidiaNim"
  | "cloudflareAi"
  | "heuristic";

export type ProviderMetadata = {
  id: ProviderId;
  /** Short, human-readable strength descriptor — not a capability contract. */
  strengths: string;
  isExternal: boolean;
};

/**
 * Ordered primary → fallback for `auto` mode. Order is the chain itself; no
 * runtime health-check or request routing happens here.
 *
 * "cloudflareAi" is intentionally NOT a member of this chain — it stays a
 * fully valid `ProviderId` (resolvable directly via `resolveChainProviderConfig`
 * / `resolveLiveProvider`), but is excluded from the default auto-fallback
 * order per the current provider-order spec, which fixes heuristic as the
 * final (6th) step with no slot after it.
 */
export const PROVIDER_CHAIN: readonly ProviderMetadata[] = [
  { id: "claude", strengths: "primary — çok adımlı tool-calling, Türkçe talimat takibi", isExternal: true },
  { id: "gemini", strengths: "secondary — tool-calling, Türkçe/ders bağlamı", isExternal: true },
  { id: "groq", strengths: "tertiary — short-fast, kısa/hızlı görevler", isExternal: true },
  { id: "nvidiaNim", strengths: "quaternary — enterprise, uzun context/özel durumlar", isExternal: true },
  { id: "cerebras", strengths: "quinary — long-context, geniş bağlam işleri", isExternal: true },
  { id: "heuristic", strengths: "fallback — external LLM yokken deterministik", isExternal: false },
];

export function getProviderMetadata(id: ProviderId): ProviderMetadata | undefined {
  return PROVIDER_CHAIN.find((p) => p.id === id);
}

export function isKnownProvider(id: string): id is ProviderId {
  return PROVIDER_CHAIN.some((p) => p.id === id);
}

/**
 * Basit sıradaki-provider kuralı — gerçek sağlık kontrolü/timeout mantığı
 * yok. Bilinmeyen veya son (heuristic) bir id verilirse "heuristic" döner,
 * böylece çağıran her zaman deterministik bir sonuca ulaşır.
 */
export function nextProviderInChain(current: ProviderId): ProviderId {
  const index = PROVIDER_CHAIN.findIndex((p) => p.id === current);
  if (index === -1 || index === PROVIDER_CHAIN.length - 1) return "heuristic";
  return PROVIDER_CHAIN[index + 1].id;
}
