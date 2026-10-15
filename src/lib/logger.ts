export const logger = {
  info: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== "test") {
      console.info("[nevii-hub]", ...args);
    }
  },
  warn: (...args: unknown[]) => {
    console.warn("[nevii-hub]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[nevii-hub]", ...args);
  },
};

/**
 * Log'a güvenle yazılabilen hata alanları: ad, kısa kod ve stack ÇERÇEVELERİ (dosya:satır).
 * `message` ve stack'in ilk satırı BİLEREK yok — sorgu parçası, bağlantı dizesi veya kişi verisi taşıyabilir
 * (bkz. audit/log.ts `safeErrorField`).
 */
export function safeErrorFields(error: unknown): { errorName: string; errorCode?: string; stackFrames?: string[] } {
  const err = error as { name?: unknown; code?: unknown; stack?: unknown } | null | undefined;
  const code = typeof err?.code === "string" && err.code.length <= 64 ? err.code : undefined;
  return {
    errorName: typeof err?.name === "string" ? err.name : "UnknownError",
    errorCode: code,
    stackFrames: typeof err?.stack === "string" ? err.stack.split("\n").slice(1, 5).map((l) => l.trim()) : undefined,
  };
}
