/**
 * 10. tur iş #2 — varsayılan, profesyonel Türkçe işlem-e-postası şablonları
 * (+ şifre sıfırlamada mevcut İngilizce karşılık). İçerik, o güne kadarki
 * kod-içi metinlerin BİREBİR karşılığıdır (davranış değişikliği yok);
 * kurum bir şablonu yayımlamadığı sürece BU metinler kullanılır.
 *
 * Alanlar: subject (düz metin) / preheader (gizli önizleme) / introHtml /
 * bodyHtml / signatureHtml / ctaLabel. Yer tutucular `{{ad}}` biçimindedir.
 */
import type { EmailTemplateKey, EmailTemplateLocale } from "./keys";

export type DefaultEmailTemplate = {
  subject: string;
  preheader: string;
  introHtml: string;
  bodyHtml: string;
  signatureHtml: string;
  ctaLabel: string;
};

const INVITE_BODY_TR = [
  "<p>Hesabınızı aktifleştirmek ve kendi şifrenizi belirlemek için aşağıdaki düğmeyi kullanın:</p>",
  "<p>{{davet_butonu}}</p>",
  "<p>Düğme çalışmıyorsa bu bağlantıyı tarayıcınıza kopyalayın:<br/>{{davet_baglantisi}}</p>",
  // "Web portal: <url>" satırı korunur (mevcut regresyon testi + düz-metin istemciler).
  "<p>Şifrenizi belirledikten sonra web portalımıza her zaman şuradan ulaşabilirsiniz:</p>",
  "<p>Web portal: {{web_portal_baglantisi}}</p>",
  "{{mobil_baglantilar}}",
].join("\n");

const DEFAULTS_TR: Record<EmailTemplateKey, DefaultEmailTemplate> = {
  student_invite: {
    subject: "{{kurum_adi}} — Ailemize Hoş Geldin, Hesabını Aktifleştir",
    preheader: "Ders programın, ödevlerin ve ödemelerin tek portalda seni bekliyor.",
    introHtml: "<p>Merhaba {{alici_adi}},</p><p>{{kurum_adi}} ailesine hoş geldin! Sizi aramızda görmekten çok mutluyuz.</p>",
    bodyHtml: [
      "<p>Kurumumuzda senin için bir öğrenci hesabı oluşturuldu — ders programını, yoklamanı, telafi haklarını ve ödeme bilgilerini tek yerden takip edebileceksin.</p>",
      "<p><strong>Giriş e-postan:</strong> {{giris_epostasi}}</p>",
      INVITE_BODY_TR,
    ].join("\n"),
    signatureHtml: "<p>Sevgiler,<br/>{{kurum_adi}} Ekibi</p>",
    ctaLabel: "Şifremi Oluştur",
  },
  parent_invite: {
    subject: "{{kurum_adi}} — Ailemize Hoş Geldiniz, Hesabınızı Aktifleştirin",
    preheader: "Çocuğunuzun ders programı, yoklaması ve ödemeleri tek portalda.",
    introHtml:
      "<p>Merhaba {{alici_adi}},</p><p>{{kurum_adi}} ailesine hoş geldiniz! Sizi aramızda görmekten çok mutluyuz.</p>",
    bodyHtml: [
      "<p>Öğrenciniz için kurumumuzda bir hesap oluşturuldu — program, yoklama, telafi ve ödeme bilgilerinizi tek yerden takip edebileceksiniz.</p>",
      "<p><strong>Giriş e-postanız:</strong> {{giris_epostasi}}</p>",
      INVITE_BODY_TR,
    ].join("\n"),
    signatureHtml: "<p>Saygılarımızla,<br/>{{kurum_adi}} Ekibi</p>",
    ctaLabel: "Şifrenizi Oluşturun",
  },
  teacher_invite: {
    subject: "{{kurum_adi}} — Ekibimize Hoş Geldiniz, Hesabınızı Aktifleştirin",
    preheader: "Ders programınız ve öğrencileriniz tek panelde sizi bekliyor.",
    introHtml:
      "<p>Merhaba {{alici_adi}},</p><p>{{kurum_adi}} ekibine hoş geldiniz! Sizi aramızda görmekten çok mutluyuz.</p>",
    bodyHtml: [
      "<p>Kurumumuzda öğretmen hesabınız oluşturuldu — ders programınızı, öğrencilerinizi ve tüm süreçlerinizi tek yerden yönetebileceksiniz.</p>",
      "<p><strong>Giriş e-postanız:</strong> {{giris_epostasi}}</p>",
      INVITE_BODY_TR,
    ].join("\n"),
    signatureHtml: "<p>Saygılarımızla,<br/>{{kurum_adi}} Ekibi</p>",
    ctaLabel: "Şifrenizi Oluşturun",
  },
  staff_invite: {
    subject: "{{kurum_adi}} — Yönetim Ekibimize Hoş Geldiniz, Hesabınızı Aktifleştirin",
    preheader: "Öğrenci, program ve tahsilat süreçleri tek panelde.",
    introHtml:
      "<p>Merhaba {{alici_adi}},</p><p>{{kurum_adi}} yönetim ekibine hoş geldiniz! Sizi aramızda görmekten çok mutluyuz.</p>",
    bodyHtml: [
      "<p>Kurumumuzda sizin için bir yönetim paneli hesabı oluşturuldu — öğrenci, program, yoklama ve tahsilat süreçlerini yetkiniz ölçüsünde tek yerden yönetebileceksiniz.</p>",
      "<p><strong>Giriş e-postanız:</strong> {{giris_epostasi}}</p>",
      INVITE_BODY_TR,
    ].join("\n"),
    signatureHtml: "<p>Saygılarımızla,<br/>{{kurum_adi}} Ekibi</p>",
    ctaLabel: "Şifrenizi Oluşturun",
  },
  password_reset: {
    subject: "{{kurum_adi}} — Şifre sıfırlama",
    preheader: "Şifre sıfırlama isteğiniz alındı. Bağlantı 30 dakika geçerlidir.",
    introHtml:
      "<p>Merhaba {{alici_adi}},</p><p>{{kurum_adi}} hesabınız için bir şifre sıfırlama isteği alındı. Bağlantı {{gecerlilik_suresi}} geçerlidir ve bir kez kullanılabilir.</p>",
    bodyHtml: [
      "<p>{{sifirlama_butonu}}</p>",
      "<p>Düğme açılmazsa sıfırlama sayfasına bu kodu yazın:</p>",
      "<p>{{sifirlama_kodu}}</p>",
      "<p>Bağlantı çalışmıyorsa:<br/>{{sifirlama_baglantisi}}</p>",
    ].join("\n"),
    signatureHtml: "",
    ctaLabel: "Şifremi Sıfırla",
  },
};

const RESET_EN: DefaultEmailTemplate = {
  subject: "{{kurum_adi}} — Reset your password",
  preheader: "Password reset request received. The link is valid for 30 minutes.",
  introHtml:
    "<p>Hello {{alici_adi}},</p><p>A password reset was requested for your {{kurum_adi}} account. It expires in {{gecerlilik_suresi}} and works once.</p>",
  bodyHtml: [
    "<p>{{sifirlama_butonu}}</p>",
    "<p>If the button does not open, use this code on the reset page:</p>",
    "<p>{{sifirlama_kodu}}</p>",
    "<p>Link:<br/>{{sifirlama_baglantisi}}</p>",
  ].join("\n"),
  signatureHtml: "",
  ctaLabel: "Reset password",
};

/** Yayınlanmış özel şablon yoksa kullanılan varsayılan. Davetlerde `en` istenirse `tr` döner (mevcut davranış). */
export function getDefaultEmailTemplate(key: EmailTemplateKey, locale: EmailTemplateLocale): DefaultEmailTemplate {
  if (key === "password_reset" && locale === "en") return RESET_EN;
  return DEFAULTS_TR[key];
}

/** Önizleme/test-e-postasında kullanılan örnek değerler (gerçek kişi verisi YOK). */
export function sampleValuesForKey(key: EmailTemplateKey): Record<string, string> {
  const invite = key !== "password_reset";
  return {
    kurum_adi: "Örnek Müzik Kursu",
    alici_adi: invite ? "Örnek Veli" : "Örnek Kullanıcı",
    giris_epostasi: "ornek.kullanici@example.com",
    gecerlilik_suresi: invite ? "7 gün" : "30 dakika",
    yil: String(new Date().getFullYear()),
  };
}
