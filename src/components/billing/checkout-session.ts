/**
 * Satın alma checkout oturumu — sekme-ömürlü istemci durumu (sessionStorage).
 *
 * Kök neden (2026-10-29, BUG1+BUG2): kayıt formu ve idempotency anahtarı
 * yalnız React state'indeydi; paket detayına gidip dönünce form boşalıyor,
 * "Kaydı oluştur" sonrası geri/ileri yapınca YENİ anahtarla ikinci kayıt
 * denemesi `pending_exists` ile duvara çarpıyordu. Token tek yanıtta
 * dönüyordu ve istemcide saklanmıyordu.
 *
 * Bu modül sekme başına şunları korur:
 * - idempotencyKey: sekme ömrü boyunca SABİT (sunucu replay'i çalışır).
 * - token: kayıt sonrası ham devam jetonu (tek kaynak: sunucu yanıtı).
 * - draft: gönderim ÖNCESİ form taslağı (geri/yenilemede kaybolmaz).
 *
 * Güvenlik notları:
 * - sessionStorage sekme kapanınca silinir (kalıcı localStorage DEĞİL);
 *   VKN/TCKN/adres taslağı URL'ye konmaz, sekmeler arası paylaşılmaz.
 * - Token yalnız aynı-origin JS'in erişimindedir; XSS zafiyeti varsa DOM
 *   zaten açıktır — bu modül yeni bir maruziyet EKLEMEZ, yalnız mevcut
 *   akışın kopmamasını sağlar.
 * - E-posta tek başına yetki DEĞİLDİR: sürdürme yalnız token veya
 *   aynı idempotencyKey (sunucu replay'i) ile olur.
 *
 * Saf + framework-bağımsız: Node testinde `storage` parametresiyle
 * bellek-sahte verilir; tarayıcıda varsayılan sessionStorage kullanılır.
 * (Alt bölümdeki `useCheckoutSession` kancası React içindir.)
 */

import { useSyncExternalStore } from "react";

export type CheckoutDraft = Record<string, string>;

export type CheckoutSession = {
  /** Sekme-ödevli idempotency anahtarı (uuid). */
  key: string;
  /** Kayıt sonrası sunucunun döndürdüğü ham token (yoksa null). */
  token: string | null;
  planKey: string;
  interval: "monthly" | "yearly";
  /** Gönderim öncesi form taslağı (yoksa null). */
  draft: CheckoutDraft | null;
  /** Son anlamlı kullanıcı işlemi (ms epoch) — §11 30dk sayacı buradan beslenir. */
  lastActivityAt: number;
};

export type CheckoutStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const CHECKOUT_SESSION_KEY = "notaplan_checkout_session_v1";

function storageOrNull(explicit?: CheckoutStorage | null): CheckoutStorage | null {
  if (explicit) return explicit;
  try {
    const g = globalThis as { sessionStorage?: CheckoutStorage };
    return g.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function newCheckoutKey(): string {
  try {
    const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    /* yoksay, aşağıda yedek */
  }
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function loadCheckoutSession(storage?: CheckoutStorage | null): CheckoutSession | null {
  const s = storageOrNull(storage);
  if (!s) return null;
  try {
    const raw = s.getItem(CHECKOUT_SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CheckoutSession>;
    if (typeof v.key !== "string" || v.key.length < 8) return null;
    return {
      key: v.key,
      token: typeof v.token === "string" && v.token ? v.token : null,
      planKey: typeof v.planKey === "string" ? v.planKey : "",
      interval: v.interval === "yearly" ? "yearly" : "monthly",
      draft: v.draft && typeof v.draft === "object" ? (v.draft as CheckoutDraft) : null,
      lastActivityAt: typeof v.lastActivityAt === "number" ? v.lastActivityAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveCheckoutSession(
  patch: Partial<CheckoutSession> & { key: string },
  storage?: CheckoutStorage | null
): void {
  const s = storageOrNull(storage);
  if (!s) return;
  const prev = loadCheckoutSession(s);
  const next: CheckoutSession = {
    key: patch.key,
    token: patch.token !== undefined ? patch.token : (prev?.token ?? null),
    planKey: patch.planKey !== undefined ? patch.planKey : (prev?.planKey ?? ""),
    interval: patch.interval !== undefined ? patch.interval : (prev?.interval ?? "monthly"),
    draft: patch.draft !== undefined ? patch.draft : (prev?.draft ?? null),
    lastActivityAt: patch.lastActivityAt ?? Date.now(),
  };
  try {
    s.setItem(CHECKOUT_SESSION_KEY, JSON.stringify(next));
  } catch {
    /* kota/gizli-mod: sessizce yazma, akış state ile sürer */
  }
  notifyCheckoutSession();
}

/** Ödeme tamamlandı / yeni kayıt başlatıldı: sekme oturumu silinir. */
export function clearCheckoutSession(storage?: CheckoutStorage | null): void {
  const s = storageOrNull(storage);
  if (!s) return;
  try {
    s.removeItem(CHECKOUT_SESSION_KEY);
  } catch {
    /* yoksay */
  }
  notifyCheckoutSession();
}

/**
 * React aboneliği (`useSyncExternalStore`): sessionStorage haricî bir
 * kaynaktır; effect içinde sync setState YASAK (react-hooks kuralı), bu
 * yüzden onaylı desen kullanılır. SSR/hidrasyonda `null` (sunucu anlık
 * görüntüsü), istemcide mount sonrası gerçek değer — hidrasyon hatasız.
 */
let snapRaw: string | null | undefined;
let snapParsed: CheckoutSession | null = null;

function readSnapshot(): CheckoutSession | null {
  const s = storageOrNull();
  let raw: string | null = null;
  try {
    raw = s?.getItem(CHECKOUT_SESSION_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw === snapRaw) return snapParsed;
  snapRaw = raw;
  snapParsed = null;
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CheckoutSession>;
    if (typeof v.key !== "string" || v.key.length < 8) return null;
    snapParsed = {
      key: v.key,
      token: typeof v.token === "string" && v.token ? v.token : null,
      planKey: typeof v.planKey === "string" ? v.planKey : "",
      interval: v.interval === "yearly" ? "yearly" : "monthly",
      draft: v.draft && typeof v.draft === "object" ? (v.draft as CheckoutDraft) : null,
      lastActivityAt: typeof v.lastActivityAt === "number" ? v.lastActivityAt : Date.now(),
    };
  } catch {
    snapParsed = null;
  }
  return snapParsed;
}

function subscribeCheckoutSession(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === CHECKOUT_SESSION_KEY || e.key === null) cb();
  };
  const onLocal = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener("notaplan:checkout", onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("notaplan:checkout", onLocal);
  };
}

export function useCheckoutSession(): CheckoutSession | null {
  return useSyncExternalStore(subscribeCheckoutSession, readSnapshot, () => null);
}

/** Aynı-sekme abonelerini uyandır (kayıt yardımcılarından çağrılır). */
function notifyCheckoutSession(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("notaplan:checkout"));
  } catch {
    /* yoksay */
  }
}

/**
 * Sekme-sabit idempotency anahtarı: kayıtlıysa aynen döner, yoksa üretip
 * saklar. Aynı sekmede geri/ileri/yenileme hep AYNI anahtarı verir →
 * sunucu replay'i ikinci kayıt yerine aynı kaydı sürdürür.
 */
export function ensureCheckoutKey(
  planKey: string,
  interval: "monthly" | "yearly",
  storage?: CheckoutStorage | null
): string {
  const s = storageOrNull(storage);
  const prev = loadCheckoutSession(s);
  if (prev) {
    // Paket/periyot değişse bile ANAHTAR ve TASLAK korunur; tutar sunucuda
    // ödeme anında yeniden hesaplanır (snapshot ödeme anında dondurulur).
    saveCheckoutSession({ key: prev.key, planKey, interval }, s);
    return prev.key;
  }
  const key = newCheckoutKey();
  saveCheckoutSession({ key, token: null, planKey, interval, draft: null }, s);
  return key;
}
