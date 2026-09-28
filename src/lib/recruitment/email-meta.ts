/** İK e-posta etiketleri + yer tutucu listesi — saf modül (istemci bileşenleri de içe aktarır). */
import type { EmailTemplateKind } from "./types";

export const EMAIL_KIND_LABELS: Record<EmailTemplateKind, string> = {
  received: "Başvuru alındı",
  positive: "Olumlu dönüş",
  negative: "Olumsuz dönüş",
  interview_invite: "Görüşme / deneme dersi daveti",
  offer: "İş teklifi",
  custom: "Özel",
};

export const EMAIL_PLACEHOLDERS: { name: string; label: string }[] = [
  { name: "aday_adi", label: "Adayın adı" },
  { name: "aday_ad_soyad", label: "Adayın adı soyadı" },
  { name: "pozisyon", label: "Pozisyon / ilan başlığı" },
  { name: "basvuru_no", label: "Başvuru numarası" },
  { name: "kurum_adi", label: "Kurum adı" },
  { name: "kurum_telefon", label: "Kurum telefonu" },
  { name: "kurum_eposta", label: "Kurum e-postası" },
  { name: "gorusme_turu", label: "Görüşme türü" },
  { name: "gorusme_tarihi", label: "Görüşme tarihi" },
  { name: "gorusme_saati", label: "Görüşme saati" },
  { name: "gorusme_yeri", label: "Görüşme yeri / bağlantısı" },
];

