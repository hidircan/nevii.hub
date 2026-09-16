/**
 * Faz 6 (ENROLLMENT_PAYMENT_RENEWAL_VALIDATION_FIX) — kayıt sözleşmesi
 * şablonu için TEK, merkezi desteklenen-alan (placeholder) kaydı.
 *
 * Önceki oturumda bu liste yalnızca `src/lib/contracts.ts` içinde, şablon
 * editörü/önizleme/PDF renderer'dan TAMAMEN AYRI yaşıyordu — doğrulayıcı ile
 * gerçek varsayılan gövde (`STUDENT_ENROLLMENT_CONTRACT_BODY`,
 * `src/lib/documents/index.ts`) arasında hiçbir ortak kaynak yoktu. Bu dosya
 * o tek kaynaktır: doğrulayıcı (`contracts.ts`), şablon yönetimi UI'ı ve
 * ileride eklenecek her renderer BURADAN okumalıdır.
 */

export type ContractTemplatePlaceholderDef = {
  key: string;
  /** Türkçe, personel için anlaşılır açıklama. */
  label: string;
  /** true ise formal sözleşme üretimi için ZORUNLU — eksikse üretim engellenir. */
  required: boolean;
};

const CORE_PLACEHOLDERS: ContractTemplatePlaceholderDef[] = [
  { key: "titleMain", label: "Sözleşme ana başlığı (öğrenci adı · dönem · versiyon)", required: true },
  { key: "paymentDueRuleText", label: "Ödeme kuralı metni (kredi kartı 1–5 / havale-nakit ≤15)", required: true },
  { key: "totalContractAmountText", label: "Toplam sözleşme bedeli", required: true },
  { key: "signatoryFullName", label: "İmzalayan (veli/öğrenci) ad soyad", required: true },
  { key: "enrollmentStartDateText", label: "Sözleşme başlangıç tarihi", required: true },
  { key: "reference", label: "Sözleşme referans numarası", required: false },
  { key: "versionNumber", label: "Sürüm numarası", required: false },
  { key: "contractTypeLabel", label: "Sözleşme türü (İlk Kayıt/Yenileme/Değişiklik)", required: false },
  { key: "previousContractNumber", label: "Önceki sözleşme numarası (yenilemede)", required: false },
  { key: "templateVersion", label: "Şablon sürümü", required: false },
  { key: "generatedAtText", label: "Üretim/başvuru tarihi", required: false },
  { key: "institutionName", label: "Kurum adı", required: false },
  { key: "institutionAddress", label: "Kurum adresi", required: false },
  { key: "studentName", label: "Öğrenci adı soyadı", required: false },
  { key: "programmeName", label: "Program / enstrüman", required: false },
  { key: "lessonScheduleText", label: "Ders günü / saati", required: false },
  { key: "unitFeeAmountText", label: "Ders saati/birim ücreti", required: false },
  { key: "enrollmentEndDateText", label: "Kayıt bitiş tarihi", required: false },
  { key: "depositAmountText", label: "Kaparo / depozito tutarı", required: false },
  { key: "signatoryNationalId", label: "İmzalayan T.C. kimlik no", required: false },
  { key: "signatoryAddress", label: "İmzalayan adres", required: false },
  { key: "consentGrantedMark", label: "Foto/video izni verildi işareti", required: false },
  { key: "consentDeniedMark", label: "Foto/video izni verilmedi işareti", required: false },
  { key: "renewalNoticeText", label: "Yenileme bildirim metni", required: false },
  // 2026-2027 sözleşme kaynağı (2026-2027-ogrenci-kayit-sozlesmesi-v1.md) —
  // yeni MADDE 1/3/4/5/KAYIT-İMZA alanları. Hepsi OPSİYONEL: mevcut/eski
  // tenant şablonlarını (bu alanları içermeyen) geriye dönük OLARAK
  // "eksik" hale GETİRMEZ — yalnızca bu alanları KULLANAN yeni şablon
  // gövdesi (bkz. src/lib/documents/index.ts STUDENT_ENROLLMENT_CONTRACT_BODY)
  // gerçek veriyle doldurulur.
  { key: "branchOptionsText", label: "Şube/kurum adresi seçim işareti (Merkez/Evka-3 vb.)", required: false },
  { key: "studentNationalIdText", label: "Öğrencinin T.C. kimlik no", required: false },
  { key: "studentBirthDateText", label: "Öğrencinin doğum tarihi", required: false },
  { key: "studentPhoneText", label: "Öğrenci/veli telefonu", required: false },
  { key: "studentEmailText", label: "Öğrenci/veli e-postası", required: false },
  { key: "lessonDurationOptionText", label: "Ders süresi seçim işareti (30/40/50 dk)", required: false },
  { key: "weeklyFrequencyOptionText", label: "Haftalık ders sıklığı seçim işareti (1/2 ders)", required: false },
  { key: "commitmentDurationOptionText", label: "Taahhüt süresi seçim işareti (3-12 ay)", required: false },
  { key: "vatStatusText", label: "KDV durumu (Dahil/Hariç)", required: false },
  { key: "kvkkNoticeDeliveredCheckboxText", label: "KVKK Aydınlatma Metni teslim işareti (Evet/Hayır)", required: false },
  { key: "photoVideoConsentFormCheckboxText", label: "Fotoğraf/Video Açık Rıza Formu sunum işareti (Evet/Hayır)", required: false },
];

/** Taksit 1 zorunlu (planın gerçekten taksitlendirildiğinin kanıtı); 2-12 opsiyonel (kullanılmayanlar boş kalabilir). */
const INSTALLMENT_PLACEHOLDERS: ContractTemplatePlaceholderDef[] = Array.from({ length: 12 }, (_, i) => i + 1).flatMap(
  (n) => [
    { key: `taksit${n}Tarih`, label: `${n}. taksit vade tarihi`, required: n === 1 },
    { key: `taksit${n}Tutar`, label: `${n}. taksit tutarı`, required: n === 1 },
    { key: `taksit${n}Aciklama`, label: `${n}. taksit türü (ör. İlk tahsilat / Dönem ücreti)`, required: false },
  ]
);

/** `student_enrollment_contract` şablon türü için TÜM desteklenen alanlar (renderer/editor/doğrulayıcı ortak kaynağı). */
export const STUDENT_ENROLLMENT_CONTRACT_PLACEHOLDERS: ContractTemplatePlaceholderDef[] = [
  ...CORE_PLACEHOLDERS,
  ...INSTALLMENT_PLACEHOLDERS,
];

export function requiredContractPlaceholders(): ContractTemplatePlaceholderDef[] {
  return STUDENT_ENROLLMENT_CONTRACT_PLACEHOLDERS.filter((p) => p.required);
}

/** Verilen şablon gövdesinde EKSİK olan zorunlu alanları döner — boşsa şablon üretime hazırdır. */
export function findMissingRequiredContractPlaceholders(bodyHtml: string): ContractTemplatePlaceholderDef[] {
  return requiredContractPlaceholders().filter((p) => !bodyHtml.includes(`{{${p.key}}}`));
}

/**
 * P0 dedup/selection fix (2026-08-30) — 2026-2027 kaynağı: `selectActiveContractTemplate`'in
 * GENELLEŞTİRİLMİŞ hali. Şu ana kadar TÜM gerçek çağıranlar (`contracts.ts createContract`,
 * `documents/index.ts getContractTemplateDiagnostics`, `services/tools.ts` KVKK/foto-video izin
 * belge üretimi) zaten `documents/index.ts listTemplates(tenantId)` ile ÖNCEDEN
 * tenant+`active:true` filtrelenmiş bir liste veriyordu — bu yüzden CANLI bir "taslak seçildi"
 * hatası GÖZLEMLENMEDİ (bkz. docs/contracts/ACTIVE_TEMPLATE_SELECTION_P0_INCIDENT_REPORT.md,
 * kanıtlı doğrulama). Ama fonksiyonun KENDİSİ bunu GARANTİ ETMİYORDU — `active` alanını hiç
 * kontrol etmiyordu, yalnızca `kind` filtreleyip `updatedAt`'a göre sıralıyordu. Bu, "çağıran
 * önceden filtrelemeyi UNUTURSA" (ör. ileride `listAllTemplates` ile besleme) sessizce bir
 * TASLAK/ARŞİVLENMİŞ şablonun seçilmesine yol açabilecek KIRILGAN bir sözleşmeydi. Artık `active`
 * KENDİSİ tarafından da zorunlu filtrelenir — çağıranın davranışından BAĞIMSIZ olarak güvenlidir.
 */
export function selectActiveTemplateOfKind<T extends { kind: string; updatedAt: string; active: boolean }>(
  templates: T[],
  kind: string
): T | undefined {
  return templates
    .filter((t) => t.kind === kind && t.active === true)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/**
 * Faz 6 — bir tenant'ın `student_enrollment_contract` türündeki AKTİF
 * şablonları arasından formal sözleşme üretiminde GERÇEKTEN kullanılacak
 * olanı seçer: EN SON GÜNCELLENEN kazanır (dizi/ekleme sırası DEĞİL). Bu tek
 * fonksiyon hem `contracts.ts createContract` hem tanılama/yönetim UI'ı
 * tarafından kullanılır — ikisi asla farklı bir şablon "görmez".
 */
export function selectActiveContractTemplate<T extends { kind: string; updatedAt: string; active: boolean }>(
  templates: T[]
): T | undefined {
  return selectActiveTemplateOfKind(templates, "student_enrollment_contract");
}

export const NO_ELIGIBLE_ACTIVE_TEMPLATE_MESSAGE =
  "Bu sözleşme türü için üretime hazır aktif şablon bulunmuyor. Lütfen Sözleşme Şablonları " +
  "bölümünden uyumlu taslağı gözden geçirip yetkili olarak aktifleştirin.";

export type EligibleTemplateSelection<T> =
  | { ok: true; template: T }
  | {
      ok: false;
      /** `no_active_template` — bu tür için `active:true` hiçbir şablon yok (hiç yok/hepsi taslak-arşiv). `diagnostics_failed` — aktif şablon bulundu ama zorunlu alan(lar) eksik. */
      reason: "no_active_template" | "diagnostics_failed";
      message: string;
      missingRequired?: ContractTemplatePlaceholderDef[];
    };

/**
 * P0 selection fix (2026-08-30) — TEK, belirsizlik BARINDIRMAYAN giriş noktası: tenant+kind için
 * ÖNCE `active===true` filtrelenir (bkz. selectActiveTemplateOfKind), SONRA zorunlu alan
 * doğrulaması (diagnostics) yapılır. `.find()`/salt `updatedAt` sıralaması TEK BAŞINA asla
 * kullanılmaz — sıralama yalnızca UYGUN (active + diagnostics geçmiş) adaylar arasında bir
 * belirleyicilik kuralıdır. Uygun şablon yoksa YAZILI, tipli, Türkçe bir hata döner — asla
 * sessizce en son taslağa/arşivlenmiş şablona/başka türe/salt metadata gövdesine DÜŞMEZ.
 */
export function selectEligibleActiveTemplateForContract<
  T extends { kind: string; updatedAt: string; active: boolean; bodyHtml: string },
>(templates: T[], kind: string): EligibleTemplateSelection<T> {
  const template = selectActiveTemplateOfKind(templates, kind);
  if (!template) {
    return { ok: false, reason: "no_active_template", message: NO_ELIGIBLE_ACTIVE_TEMPLATE_MESSAGE };
  }
  const missingRequired = findMissingRequiredContractPlaceholders(template.bodyHtml);
  if (missingRequired.length > 0) {
    return { ok: false, reason: "diagnostics_failed", message: NO_ELIGIBLE_ACTIVE_TEMPLATE_MESSAGE, missingRequired };
  }
  return { ok: true, template };
}

/** Şablonda GEÇEN ama kayıtta hiç TANIMLI olmayan (renderer tarafından desteklenmeyen) alanlar. */
export function findUnsupportedPlaceholders(bodyHtml: string): string[] {
  const supported = new Set(STUDENT_ENROLLMENT_CONTRACT_PLACEHOLDERS.map((p) => p.key));
  // Şablonun kendi teknik/sistem alanları (renderTemplate tarafından ayrıca doldurulur, editöre görünmez).
  const systemKeys = new Set(["reference", "date"]);
  const found = new Set<string>();
  const re = /\{\{([\w.]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyHtml)) !== null) {
    const key = m[1]!;
    if (!supported.has(key) && !systemKeys.has(key)) found.add(key);
  }
  return Array.from(found);
}
