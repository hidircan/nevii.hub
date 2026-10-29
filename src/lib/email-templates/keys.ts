/**
 * 10. tur iş #2 — kurum bazlı işlem-e-postası şablonlarının anahtar/alan
 * tanımları.
 *
 * ŞABLON KAPSAMI (net sınır):
 * - Şablonla yönetilen (bu modül): 4 davet (öğrenci/veli/öğretmen/personel)
 *   + şifre sıfırlama. Davet e-postaları bugün yalnız Türkçe; şifre
 *   sıfırlama tr+en (mevcut çok-dil desteği korunur, en yoksa tr'ye düşülür).
 * - Kapsam DIŞI (sabit kod-içi metin, bu modüle alınmadı): e-posta değiştirme
 *   doğrulama/bildirim e-postaları (`auth/email-change.ts`), SMTP dışı
 *   kanallar (SMS/WhatsApp — kendi onaylı-şablon akışları var). Yeni bir
 *   işlem e-postası şablon kapsamına alınacaksa buraya YENİ bir anahtar +
 *   varsayılan metin eklenir (mevcut anahtarların anlamı değiştirilmez).
 */

export const EMAIL_TEMPLATE_KEYS = [
  "student_invite",
  "parent_invite",
  "teacher_invite",
  "staff_invite",
  "password_reset",
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_LOCALES = ["tr", "en"] as const;
export type EmailTemplateLocale = (typeof EMAIL_TEMPLATE_LOCALES)[number];

/** Davet anahtarları bugün yalnız Türkçe üretilir (mevcut davranış korunur). */
export function localesForKey(key: EmailTemplateKey): EmailTemplateLocale[] {
  return key === "password_reset" ? ["tr", "en"] : ["tr"];
}

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  student_invite: "Öğrenci daveti",
  parent_invite: "Veli daveti",
  teacher_invite: "Öğretmen daveti",
  staff_invite: "Personel daveti",
  password_reset: "Şifre sıfırlama",
};

/**
 * Yer tutucular. `structural: true` olanlar yönetici metninden KAÇIŞSIZ
 * alınmaz — sunucu tarafında güvenli HTML ile ÜRETİLİR (düğme, kod bloğu,
 * bağlantı listesi). `required: true` olanlar gövdede (intro/body/signature
 * toplamında) BULUNMAK ZORUNDADIR — yoksa taslak kaydedilir ama
 * YAYIMLANAMAZ; böylece yönetici davet bağlantısını/kodu yanlışlıkla
 * silemez.
 */
export type TemplatePlaceholder = {
  name: string;
  label: string;
  required: boolean;
  structural: boolean;
};

/** Tüm anahtarlarda ortak, düz-metin (kaçışlı) değerler. */
export const COMMON_PLACEHOLDERS: TemplatePlaceholder[] = [
  { name: "kurum_adi", label: "Kurum adı", required: false, structural: false },
  { name: "alici_adi", label: "Alıcı adı", required: false, structural: false },
  { name: "giris_epostasi", label: "Giriş e-postası", required: false, structural: false },
  { name: "gecerlilik_suresi", label: "Geçerlilik süresi (örn. 7 gün)", required: false, structural: false },
  { name: "yil", label: "Yıl", required: false, structural: false },
];

export const INVITE_PLACEHOLDERS: TemplatePlaceholder[] = [
  ...COMMON_PLACEHOLDERS,
  { name: "davet_baglantisi", label: "Davet bağlantısı (düz URL)", required: false, structural: true },
  { name: "davet_butonu", label: "Davet düğmesi (tıklanabilir)", required: true, structural: true },
  { name: "web_portal_baglantisi", label: "Web portal bağlantısı (düz URL)", required: false, structural: true },
  { name: "mobil_baglantilar", label: "Mobil uygulama bağlantıları (yayınlanmadıysa boş)", required: false, structural: true },
];

export const RESET_PLACEHOLDERS: TemplatePlaceholder[] = [
  ...COMMON_PLACEHOLDERS,
  { name: "sifirlama_baglantisi", label: "Sıfırlama bağlantısı (düz URL)", required: false, structural: true },
  { name: "sifirlama_butonu", label: "Sıfırlama düğmesi (tıklanabilir)", required: true, structural: true },
  { name: "sifirlama_kodu", label: "Sıfırlama kodu (elle yazılabilir)", required: true, structural: true },
];

export function placeholdersForKey(key: EmailTemplateKey): TemplatePlaceholder[] {
  return key === "password_reset" ? RESET_PLACEHOLDERS : INVITE_PLACEHOLDERS;
}

/** Anahtar başına e-posta düğme rengi (mevcut marka renkleri korunur). */
export const CTA_COLORS: Record<EmailTemplateKey, string> = {
  student_invite: "#d97706",
  parent_invite: "#d97706",
  teacher_invite: "#d97706",
  staff_invite: "#d97706",
  password_reset: "#146c3a",
};

export function isEmailTemplateKey(v: string): v is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(v);
}
