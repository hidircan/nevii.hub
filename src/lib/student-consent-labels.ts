/**
 * Öğrenci listesi izin filtreleri — filtre seçenekleri ve satır değerleri bu TEK sözlükten gelir
 * (sunucu sayfası satırı üretir, istemci tablosu seçenekleri sunar; ikisi ayrışamaz). Saf, I/O yok.
 */
export const KVKK_CONSENT_LABELS = ["Var", "Yok"] as const;
export type KvkkConsentLabel = (typeof KVKK_CONSENT_LABELS)[number];

export const PHOTO_CONSENT_LABELS = ["Veriyor", "Vermiyor", "Kayıt yok"] as const;
export type PhotoConsentLabel = (typeof PHOTO_CONSENT_LABELS)[number];

/** Fotoğraf paylaşımı sayılmayan kapsamlar (yalnız ad / ses izni fotoğraf izni değildir). */
const NON_PHOTO_SCOPES = new Set(["name", "voice"]);

/**
 * En güncel kayıt yoksa "Kayıt yok"; "verildi" VE en az bir görsel paylaşım kapsamı/kanalı varsa "Veriyor".
 * KÖK NEDEN (2026-10-19): sözleşme formu (2026-2027 Fotoğraf/Video Açık Rıza) izni KANAL olarak kaydeder
 * (website, instagram, print_materials…) — "photo" kapsamı hiç yazılmaz; eski `scopes.includes("photo")`
 * kontrolü bu yüzden verilmiş izinleri "Vermiyor" sayıyordu.
 */
export function photoConsentLabel(c: { status: string; scopes: unknown } | undefined): PhotoConsentLabel {
  if (!c) return "Kayıt yok";
  const scopes = Array.isArray(c.scopes) ? (c.scopes as unknown[]) : [];
  return c.status === "granted" && scopes.some((s) => typeof s === "string" && !NON_PHOTO_SCOPES.has(s)) ? "Veriyor" : "Vermiyor";
}
