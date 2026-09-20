import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";
// NOTE: `api/hooks` RN zinciri çeker (client → react-native Platform),
// node test env'inde import EDİLMEZ — hook sözleşmesi kaynak taramayla
// doğrulanır. `api/errors` saf modüldür, import edilebilir.
import { FEATURE_UNAVAILABLE, NETWORK_ERROR } from "../../../api/errors";

/**
 * Absence-notices + receipt UI contract testleri (canonical).
 *
 * Kararlar: docs/mobile/MOBILE_API_ROUTE_DECISIONS.md
 * - Absence: backend domain'i YOK → stale çağrı kaldırıldı; UI'da
 *   kırık çağrı kalamaz; gerekiyorsa FEATURE_UNAVAILABLE.
 * - Receipt: GET /api/v1/payments/:id/receipt read-only; eligible:false
 *   veya 403/404'te fake makbuz YOK; doğrudan payment mutation YOK
 *   (online ödeme yalnız hosted-checkout helper'ıyla, kart verisi aparte).
 *
 * Ortak dosyalar (student-scope) yalnız read-only okunur, değiştirilmez.
 */

const STUDENT_SCOPE_DIR = path.join(__dirname, "../../student-scope");
const PARENT_FEATURE_DIR = path.join(__dirname, "..");

async function readSource(relative: string, base: string): Promise<string> {
  return fs.readFile(path.join(base, relative), "utf-8");
}

/** Açıklayıcı yorumlardaki bahsetmeler çağrı değildir — testler kodu tarar. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("absence notices contract", () => {
  it("FEATURE_UNAVAILABLE canonical güvenli mesajı taşır", () => {
    expect(FEATURE_UNAVAILABLE.code).toBe("FEATURE_UNAVAILABLE");
    expect(FEATURE_UNAVAILABLE.message).toBe("Bu özellik şu anda mobil uygulamada kullanılamıyor.");
  });

  it("lessons-screen'de stale absence-notices çağrısı yoktur", async () => {
    const content = await readSource("lessons-screen.tsx", STUDENT_SCOPE_DIR);
    const code = stripComments(content);
    expect(code).not.toMatch(/absence-notices/);
    expect(code).not.toMatch(/AbsenceNotice/);
  });

  it("parent dosyalarında absence çağrısı/CTA yoktur", async () => {
    const entries = await fs.readdir(PARENT_FEATURE_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() || !/\.(tsx?)$/.test(e.name)) continue;
      const content = await readSource(e.name, PARENT_FEATURE_DIR);
      expect(content, e.name).not.toMatch(/absence-notices|AbsenceNotice/);
    }
  });
});

describe("receipt contract", () => {
  it("paymentReceipt uç tanımı id'yi encode eder, kapsam parametresi almaz", async () => {
    const raw = await fs.readFile(path.join(__dirname, "../../../api/hooks.ts"), "utf-8");
    const hooks = stripComments(raw);
    expect(hooks).toContain("paymentReceipt");
    expect(hooks).toContain("encodeURIComponent(paymentId)");
    expect(hooks).toContain("/api/v1/payments/");
    expect(hooks).not.toMatch(/studentId|tenantId|teacherId|branchId/);
  });

  it("useMakeupRequests/usePaymentReceipt canonical hook'ları tanımlıdır", async () => {
    const hooks = await fs.readFile(path.join(__dirname, "../../../api/hooks.ts"), "utf-8");
    expect(hooks).toContain("export function useMakeupRequests");
    expect(hooks).toContain("export function usePaymentReceipt");
    expect(hooks).toContain("/api/v1/makeup");
  });

  it("payments-screen makbuzu eligible dalıyla gösterir (fake PDF yok)", async () => {
    const content = await readSource("payments-screen.tsx", STUDENT_SCOPE_DIR);
    expect(content).toContain("eligible");
    expect(content).not.toMatch(/fake|mock|samplePdf|blob:|\.pdf(\?|"|')/i);
  });

  it("payments-screen'de doğrudan mutasyon yoktur; online ödeme yalnız hosted-checkout helper'ıyla", async () => {
    // Kapsam değişikliği (mobil online ödeme): hosted checkout'a yönlendirme
    // VAR, ama doğrudan apiPost/apiDelete/apiPatch YOK — tek çıkış
    // `startOnlineCheckout` (sistem tarayıcısı, kart verisi uygulamaya girmez).
    const content = await readSource("payments-screen.tsx", STUDENT_SCOPE_DIR);
    const code = stripComments(content);
    expect(code).not.toMatch(/\bapiPost\b|\bapiDelete\b|\bapiPatch\b/);
    expect(code).not.toMatch(/payout|card-payment|cardNumber|\bcvv\b|\bcvc\b|expiry/i);
    expect(code).toContain("startOnlineCheckout");
  });

  it("NETWORK_ERROR canonical mesajı Türkçe ve sızıntısızdır", () => {
    expect(NETWORK_ERROR.code).toBe("NETWORK_ERROR");
    expect(NETWORK_ERROR.message.length).toBeGreaterThan(0);
    expect(NETWORK_ERROR.message).not.toMatch(/token|password|DATABASE_URL|stack/i);
  });
});
