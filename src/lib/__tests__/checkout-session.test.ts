/**
 * BUG1+BUG2 regresyonu: checkout oturumu sekme boyunca anahtar + token +
 * taslağı korur; geri/ileri/yenileme aynı anahtarı verir (sunucu replay'i
 * ikinci kayıt açmaz). Bozuk girdi sessizce yok sayılır (kilitlenme yok).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  CHECKOUT_SESSION_KEY,
  clearCheckoutSession,
  ensureCheckoutKey,
  loadCheckoutSession,
  saveCheckoutSession,
  type CheckoutStorage,
} from "@/components/billing/checkout-session";

function memStorage(): CheckoutStorage & { dump: () => string | null } {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => m.get(CHECKOUT_SESSION_KEY) ?? null,
  };
}

describe("checkout-session", () => {
  let s: ReturnType<typeof memStorage>;
  beforeEach(() => {
    s = memStorage();
  });

  it("boşken null döner; ensure üretip saklar", () => {
    expect(loadCheckoutSession(s)).toBeNull();
    const k = ensureCheckoutKey("core", "monthly", s);
    expect(k.length).toBeGreaterThanOrEqual(8);
    expect(loadCheckoutSession(s)?.key).toBe(k);
  });

  it("geri/ileri/yenileme AYNI anahtarı verir (replay çalışır)", () => {
    const k1 = ensureCheckoutKey("core", "monthly", s);
    const k2 = ensureCheckoutKey("core", "monthly", s);
    const k3 = ensureCheckoutKey("core", "monthly", s);
    expect(k2).toBe(k1);
    expect(k3).toBe(k1);
  });

  it("paket/periyot değişince anahtar + token + taslak korunur", () => {
    const k = ensureCheckoutKey("core", "monthly", s);
    saveCheckoutSession({ key: k, token: "t".repeat(64), draft: { ownerEmail: "a@t.com" } }, s);
    const k2 = ensureCheckoutKey("pro", "yearly", s);
    expect(k2).toBe(k);
    const cur = loadCheckoutSession(s)!;
    expect(cur.token).toBe("t".repeat(64));
    expect(cur.draft).toEqual({ ownerEmail: "a@t.com" });
    expect(cur.planKey).toBe("pro");
    expect(cur.interval).toBe("yearly");
  });

  it("token benimsenir; temizlikte her şey silinir", () => {
    const k = ensureCheckoutKey("core", "monthly", s);
    saveCheckoutSession({ key: k, token: "x".repeat(64) }, s);
    expect(loadCheckoutSession(s)?.token).toBe("x".repeat(64));
    clearCheckoutSession(s);
    expect(loadCheckoutSession(s)).toBeNull();
    // Sonraki ensure YENİ anahtar üretir (eski kayda bağlanmaz).
    expect(ensureCheckoutKey("core", "monthly", s)).not.toBe(k);
  });

  it("bozuk girdi kilitlenmez (null + yeni anahtar)", () => {
    s.setItem(CHECKOUT_SESSION_KEY, "{bozuk json");
    expect(loadCheckoutSession(s)).toBeNull();
    expect(ensureCheckoutKey("core", "monthly", s).length).toBeGreaterThanOrEqual(8);
    s.setItem(CHECKOUT_SESSION_KEY, JSON.stringify({ key: "kısa" }));
    expect(loadCheckoutSession(s)).toBeNull();
  });

  it("depolama yoksa (SSR) patlamaz", () => {
    expect(loadCheckoutSession(null)).toBeNull();
    expect(() => saveCheckoutSession({ key: "k_12345678" }, null)).not.toThrow();
    expect(() => clearCheckoutSession(null)).not.toThrow();
  });
});
