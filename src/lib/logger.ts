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
  const short = (v: unknown) => (typeof v === "string" && v.length <= 64 ? v : undefined);
  return {
    errorName: short(err?.name) ?? "UnknownError",
    errorCode: short(err?.code),
    // Yalnız "at ..." çerçeveleri: çok satırlı mesajın (ör. Prisma doğrulama hatası sorgu argümanlarını içerir)
    // devam satırları stack'te çerçevelerden ÖNCE gelir ve asla log'a girmemeli.
    stackFrames:
      typeof err?.stack === "string"
        ? err.stack.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ")).slice(0, 4)
        : undefined,
  };
}
