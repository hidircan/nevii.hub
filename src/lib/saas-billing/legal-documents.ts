/**
 * Satın alma hukuki belge kayıt defteri (§4, §5).
 *
 * SINIR (owner talimatı): hukuki oran/kimlik/taahhüt UYDURULMAZ. Bu dosya
 * belge METNİ içermez; her belge için başlık, sürüm, kapsam notu ve
 * onay durumunu tutar. Tam metinler hukukçu incelemesinden geçip
 * onaylanmadan "resmî/onaylı sözleşme" diye SUNULMAZ; onaylı metin
 * yoksa gerçek satış kapalıdır (mock demo tek bantla işaretlenir).
 *
 * Kabul kaydı: ödeme anında `docVersions` (belge → sürüm) sipariş
 * onaylarıyla birlikte dondurulur; şablon sonradan değişse geçmiş kabul
 * DEĞİŞMEZ. Sürüm karması: `docVersionHash` (sha256, 12 hane).
 *
 * ONAY MATRİSİ (işlem türü → gerekli kutular):
 * - B2B ilk ödeme: [1] Hizmet Sözleşmesi + Yenileme/İptal Koşulları
 *   (tek kutu, 2 belge); [2] otomatik tahsilat yetkisi (ayrı kutu);
 *   KVKK aydınlatması + gizlilik + DPA/SLA/mesafeli = BİLGİLENDİRME
 *   (sunuldu kaydı, rıza kutusu DEĞİL); [isteğe bağlı] pazarlama izni.
 * - Otomatik yenileme: ilk ödemedeki yetki + güncel sürüm kontrolü;
 *   sürüm değişmişse ödeme öncesi yeniden kabul istenir.
 * - Paket değişimi: fiyat/koşul değiştiyse ilgili kabuller yenilenir.
 * - Tüketici işlemi: şu an SATILMIYOR (B2B dışı akış kapalı); mesafeli
 *   satış hükümleri otomatik uygulanmaz.
 */
import { createHash } from "crypto";

export type LegalDocScope = "required" | "notice";

export type LegalDoc = {
  /** Sabit belge kimliği (kabul kaydında kullanılır). */
  id: string;
  /** Müşteriye görünen başlık. */
  title: string;
  /** Yayımlanmış taslak sürümü (değişince kabul yenilenir). */
  version: string;
  /** Kapsam: required = sözleşme kabulü gerekir; notice = bilgilendirme (sunuldu kaydı). */
  scope: LegalDocScope;
  /** Kapsam açıklaması (hukuki metin DEĞİL, yönlendirme cümlesi). */
  about: string;
  /** B2B satın almada uygulanabilir mi? */
  appliesB2B: boolean;
  /** Hukukçu incelemesinden geçti mi? false iken gerçek satış kapalıdır. */
  approved: boolean;
};

export const LEGAL_DOCS: readonly LegalDoc[] = [
  {
    id: "saas-service-terms",
    title: "B2B SaaS Hizmet Sözleşmesi",
    version: "2026-10-29-d1",
    scope: "required",
    about: "Kurumunuza NeviiHub hizmetinin sunulma koşulları, kullanım hakkı, süre ve sorumluluk çerçevesi.",
    appliesB2B: true,
    approved: false,
  },
  {
    id: "renewal-cancel-refund",
    title: "Yenileme, İptal ve İade Koşulları",
    version: "2026-10-29-d1",
    scope: "required",
    about: "Otomatik yenileme, iptal adımları, dönem sonu erişim ve iade başvuru çerçevesi.",
    appliesB2B: true,
    approved: false,
  },
  {
    id: "kvkk-notice",
    title: "KVKK Aydınlatma Metni",
    version: "2026-10-29-d1",
    scope: "notice",
    about: "Bilgilerinizin hangi amaçla işlendiği, kimlerle paylaşılmadığı ve haklarınız hakkında bilgilendirme. Aydınlatma bir rıza kutusu değildir.",
    appliesB2B: true,
    approved: false,
  },
  {
    id: "privacy-policy",
    title: "Gizlilik ve Veri Saklama Hükümleri",
    version: "2026-10-29-d1",
    scope: "notice",
    about: "Verilerin saklanma süresi, korunması ve erişim sınırları.",
    appliesB2B: true,
    approved: false,
  },
  {
    id: "dpa-note",
    title: "Veri İşleme ve Alt Yükleniciler Notu",
    version: "2026-10-29-d1",
    scope: "notice",
    about: "Ödeme ve e-posta gibi hizmet alınan taraflar ile veri işleme rolleri hakkında bilgilendirme.",
    appliesB2B: true,
    approved: false,
  },
  {
    id: "sla-note",
    title: "Hizmet Seviyesi Notu",
    version: "2026-10-29-d1",
    scope: "notice",
    about: "Destek saatleri ve hizmet hedefleri hakkında bilgilendirme (ölçülmemiş vaat içermez).",
    appliesB2B: true,
    approved: false,
  },
  {
    id: "distance-sales-note",
    title: "Mesafeli Satış Bilgilendirmesi",
    version: "2026-10-29-d1",
    scope: "notice",
    about: "Bu satın alma kurumsal (B2B) kapsamdadır; tüketici mesafeli satış hükümleri otomatik uygulanmaz. Uygulanabilirlik hukukçu incelemesindedir.",
    appliesB2B: true,
    approved: false,
  },
] as const;

export function getApplicableDocs(): LegalDoc[] {
  return LEGAL_DOCS.filter((d) => d.appliesB2B);
}

export function getRequiredDocs(): LegalDoc[] {
  return getApplicableDocs().filter((d) => d.scope === "required");
}

/** Gerçek satış kilidi: zorunlu sözleşmelerin TÜMÜ hukuk onaylı olmalı. */
export function getDocsApprovalStatus(): { allApproved: boolean; pending: string[] } {
  const pending = getRequiredDocs().filter((d) => !d.approved).map((d) => d.title);
  return { allApproved: pending.length === 0, pending };
}

/** Kabul anındaki sürüm karması (belge → 12 haneli sha256). */
export function docVersionHash(doc: LegalDoc): string {
  return createHash("sha256").update(`${doc.id}:${doc.version}`, "utf8").digest("hex").slice(0, 12);
}

/**
 * İstemcinin gönderdiği kabul sürümlerini doğrular: B2B zorunlu belgelerin
 * TAMAMI güncel sürümle kabul edilmiş olmalı. Eksik/bayat → hata metni.
 */
export function validateDocAcceptance(input: unknown): { ok: true } | { ok: false; message: string } {
  const required = getRequiredDocs();
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "Sözleşme onayları eksik; belgeleri inceleyip onaylayın." };
  }
  const rec = input as Record<string, unknown>;
  const missing = required.filter((d) => rec[d.id] !== d.version).map((d) => d.title);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Şu belgelerin güncel sürümü onaylanmalı: ${missing.join(", ")}.`,
    };
  }
  return { ok: true };
}
