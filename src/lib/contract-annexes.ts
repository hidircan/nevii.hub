/**
 * P0 (2026-09-05) — TEK BİRLEŞİK SÖZLEŞME ÇIKTISI.
 *
 * Kullanıcı raporu: kayıt sözleşmesi, KVKK/kişisel veriler metni ve
 * Fotoğraf/Video açık rıza formu AYRI AYRI basılıyordu ("bölünmüş" akış).
 * Beklenen davranış: önizleme, yazdırma ve PDF çıktısının HEPSİNDE TEK,
 * sıralı bir belge:
 *
 *   1) Ana sözleşme metni (kurumun YÜKLEDİĞİ aktif şablon)
 *   2) KVKK / kişisel veriler bölümü
 *   3) Fotoğraf / video açık rıza bölümü
 *
 * EK BÖLÜMLERİN KAYNAĞI (P0, 2026-09-05 revizyonu): kurumun kendi aktif
 * `kvkk` / `parent_social_media_consent` şablonu ANLAMLI uzunluktaysa o
 * kullanılır; yoksa ya da eski bir tek satırlık "stub" kaldıysa KURUMSAL
 * KAYNAK METNİ (`canonicalTemplateBody`, 2026-2027 kayıt sözleşmesi
 * kaynağının KVKK ve Fotoğraf/Video bölümleri) kullanılır. Böylece normal
 * yeni-öğrenci akışında AYRI bir "taslak oluştur → şablonu etkinleştir"
 * adımı GEREKMEZ; hiçbir şablon değiştirilmez, yalnızca ÇIKTI beslenir.
 *
 * TASARIM KARARLARI (bilinçli):
 * - Bölümler hukuken AYRI kalır: her ekin kendi başlığı, kendi referans
 *   numarası ve şablonundan gelen kendi tarih/imza/rıza alanları vardır.
 *   "Hepsini kabul ediyorum" gibi tek bir muğlak onay ASLA üretilmez.
 * - Hukuki metin YENİDEN YAZILMAZ, PARÇALANMAZ veya SIRALANMAZ. Ana
 *   sözleşmenin gövdesine (MADDE 19/20 dahil) DOKUNULMAZ; ekler onun
 *   ARDINA, olduğu gibi eklenir. Bu yüzden metin kaybı/çoğaltması olamaz —
 *   heuristik/AI ile bölümleme YOKTUR, yalnızca şablon türü (`kind`) ile
 *   deterministik seçim yapılır.
 * - Ek metinleri sözleşme OLUŞTURULURKEN dondurulur (`ContractDataSnapshot.annexes`)
 *   — kurum sonradan KVKK şablonunu değiştirse bile geçmiş sözleşmenin
 *   çıktısı DEĞİŞMEZ (repo kuralı: geçmiş belge anlık görüntüleri değişmez).
 *   Bu alan yokken üretilmiş ESKİ sözleşmeler için, okuma anında aktif
 *   şablonlardan canlı üretilir — aksi halde eski sözleşmeler birleşik
 *   çıktıyı hiç alamazdı.
 */
import { canonicalTemplateBody, renderTemplate } from "./documents";
import { selectActiveTemplateOfKind } from "./contract-template-schema";
import type { ContractAnnexSnapshot } from "./types";

export const CONTRACT_ANNEX_TITLES = {
  kvkk: "KVKK Aydınlatma Metni / Kişisel Verilerin Korunması",
  parent_social_media_consent: "Fotoğraf / Video Açık Rıza Formu",
} as const;

export type ContractAnnexKind = keyof typeof CONTRACT_ANNEX_TITLES;

/** Ek sırası SABİTTİR: önce KVKK, hemen ardından fotoğraf/video (kullanıcı talebi). */
export const CONTRACT_ANNEX_ORDER: ContractAnnexKind[] = ["kvkk", "parent_social_media_consent"];

/**
 * Bir ek şablonunun "gerçek hukuki metin" mi yoksa eski bir tek satırlık
 * örnek/stub kayıt mı olduğunu ayıran deterministik eşik. TAHMİN/AI YOK.
 */
const MIN_MEANINGFUL_ANNEX_BODY_LENGTH = 400;

export const SOCIAL_MEDIA_SCOPE_LABELS: Record<string, string> = {
  photo: "Fotoğraf",
  video: "Video",
  name: "Ad Soyad",
  voice: "Ses",
  website: "Kurumun resmi internet sitesi",
  instagram: "Kurumun resmi Instagram ve diğer sosyal medya hesapları",
  print_materials: "Kurumun basılı tanıtım materyalleri (broşür, afiş vb.)",
  digital_ads: "Kurumun dijital tanıtım/reklam çalışmaları",
  in_house_board: "Kurum içi pano ve etkinlik tanıtımları",
  other: "Diğer",
};

export function formatConsentScopesText(scopes: readonly string[] | undefined): string {
  if (!scopes || scopes.length === 0) return "—";
  return scopes.map((s) => SOCIAL_MEDIA_SCOPE_LABELS[s] ?? s).join(", ");
}

export type BuildContractAnnexesInput = {
  templates: Array<{ id: string; kind: string; bodyHtml: string; active: boolean; updatedAt: string }>;
  contractNumber: string;
  institutionName: string;
  institutionAddress: string;
  studentName: string;
  parentName: string;
  dateText: string;
  photoVideoConsent?: { granted: boolean; scopes?: readonly string[] };
};

/**
 * Bir ek bölümün gövdesini çözer: kurumun ANLAMLI uzunluktaki aktif şablonu
 * varsa o, yoksa kurumsal kaynak metni. `undefined` yalnız ikisi de yoksa
 * döner — o durumda ek sessizce atlanır ve ana sözleşme çıktısı KIRILMAZ.
 */
function resolveAnnexBody(
  templates: BuildContractAnnexesInput["templates"],
  kind: ContractAnnexKind
): string | undefined {
  const template = selectActiveTemplateOfKind(templates, kind);
  if (template && template.bodyHtml.length >= MIN_MEANINGFUL_ANNEX_BODY_LENGTH) return template.bodyHtml;
  return canonicalTemplateBody(kind) ?? template?.bodyHtml;
}

/**
 * Ek bölümleri sözleşme verileriyle render eder (kaynak seçimi için bkz.
 * `resolveAnnexBody`).
 */
export function buildContractAnnexes(input: BuildContractAnnexesInput): ContractAnnexSnapshot[] {
  const granted = input.photoVideoConsent?.granted === true;
  const fields: Record<string, string> = {
    institutionName: input.institutionName,
    institutionAddress: input.institutionAddress,
    studentName: input.studentName,
    parentName: input.parentName,
    date: input.dateText,
    reference: input.contractNumber,
    scopes: formatConsentScopesText(input.photoVideoConsent?.scopes),
    consentGrantedMark: granted ? "☑" : "☐",
    consentDeniedMark: granted ? "☐" : "☑",
  };

  const annexes: ContractAnnexSnapshot[] = [];
  CONTRACT_ANNEX_ORDER.forEach((kind, index) => {
    const bodyHtml = resolveAnnexBody(input.templates, kind);
    if (!bodyHtml) return;
    const reference = `${input.contractNumber}-EK${index + 1}`;
    annexes.push({
      kind,
      title: CONTRACT_ANNEX_TITLES[kind],
      reference,
      html: renderTemplate(bodyHtml, { ...fields, reference }),
    });
  });
  return annexes;
}

/**
 * Ana sözleşme + ekleri TEK bir HTML çıktısına birleştirir. Saf fonksiyon —
 * önizleme, yazdırma sayfası ve PDF/`/api/v1/contracts/:id/html` AYNI
 * fonksiyonu kullanır, bu yüzden üçünün bölüm sırası birbirinden SAPAMAZ.
 * Ek yoksa ana sözleşme HTML'i aynen döner (davranış değişmez).
 */
export function composeContractOutputHtml(mainHtml: string, annexes: readonly ContractAnnexSnapshot[]): string {
  if (annexes.length === 0) return mainHtml;
  const sections = annexes.map(
    (a) => `
<section class="contract-annex" style="break-before:page;page-break-before:always;margin-top:32px;padding-top:24px;border-top:2px solid #333;">
<p class="contract-annex-ref" style="margin:0 0 12px;font-size:9pt;text-transform:uppercase;letter-spacing:0.04em;">${escapeText(a.title)} · Referans: ${escapeText(a.reference)}</p>
${a.html}
</section>`
  );
  return `<section class="contract-main">${mainHtml}</section>${sections.join("")}`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * P0 (2026-09-05) — EK ŞABLON TANILAMASI. Bazı kurumlarda `kvkk` /
 * `parent_social_media_consent` türlerinde ESKİ, tek satırlık "stub"
 * şablonlar aktif kalmış olabilir (yalnız başlık + referans satırı). Bu
 * durumda ÇIKTI ARTIK ZAYIF KALMAZ — `resolveAnnexBody` kurumsal kaynak
 * metnine düşer — ama kurumun kendi şablon kaydı hâlâ eskidir ve yönetici
 * bunu bilmelidir. Burada TAHMİN/AI YOK: yalnız (a) aktif şablon var mı,
 * (b) gövdesi anlamlı bir uzunluğa ulaşıyor mu, deterministik olarak
 * bakılır; sistem şablonu KENDİLİĞİNDEN değiştirmez.
 */
export type ContractAnnexTemplateDiagnostic = {
  kind: ContractAnnexKind;
  title: string;
  status: "ok" | "missing" | "stub";
};

export function diagnoseContractAnnexTemplates(
  templates: Array<{ kind: string; bodyHtml: string; active: boolean; updatedAt: string }>
): ContractAnnexTemplateDiagnostic[] {
  return CONTRACT_ANNEX_ORDER.map((kind) => {
    const template = selectActiveTemplateOfKind(templates, kind);
    const status: ContractAnnexTemplateDiagnostic["status"] = !template
      ? "missing"
      : template.bodyHtml.length < MIN_MEANINGFUL_ANNEX_BODY_LENGTH
        ? "stub"
        : "ok";
    return { kind, title: CONTRACT_ANNEX_TITLES[kind], status };
  });
}
