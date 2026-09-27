/**
 * Hesap daveti (öğretmen/öğrenci/veli) — davet e-postası gönderimi ve kabulü.
 *
 * Kural (görev talebi Faz 4): "reuse existing password reset/invitation
 * machinery, do not duplicate". Bu modül YENİ bir token tablosu/mekanizması
 * EKLEMEZ — mevcut `createPasswordResetToken`/`consumePasswordResetToken`/
 * `updatePasswordHash` (bkz. `password-reset.ts`, `users.ts`) üzerine ince
 * bir orkestrasyon katmanıdır: "hesabınızı aktifleştirin" linki, teknik
 * olarak AYNI tek-kullanımlık/hash'li/süreli kod altyapısıyla çalışır,
 * yalnızca süresi daha uzundur (davet e-postası hemen açılmayabilir) ve
 * kabul edildiğinde ek olarak bekleyen `StudentPortalAccess` (veli/öğrenci
 * portal erişimi, varsa) satırlarını aktive eder.
 *
 * Asla düz metin şifre e-postalanmaz — kullanıcı şifresini bu linkle KENDİSİ
 * belirler (bkz. acceptAccountInvitation).
 */
import { createPasswordResetToken } from "./password-reset";
import { getAppBaseUrl, getMobileAppLinks, sendEmail, type EmailSendResult } from "../email";
import { renderTransactionalEmail, type RenderValues } from "../email-templates/engine";
import type { EmailTemplateKey } from "../email-templates/keys";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün — davet e-postası hemen açılmayabilir.

/**
 * P0 personel onboarding revizyonu — idari personele (`SCHOOL_ADMIN`)
 * panel daveti de AYNI token altyapısıyla gönderilir (yeni mekanizma yok).
 * `SUPER_ADMIN`/platform rolleri davet EDİLEMEZ — tools katmanı engeller.
 */
export type InvitationRole = "TEACHER" | "STUDENT" | "SCHOOL_ADMIN";

export type SendInvitationInput = {
  tenantId: string;
  userId: string;
  email: string;
  recipientName: string;
  institutionName: string;
  role: InvitationRole;
  /**
   * 10. tur iş #2 — STUDENT davetlerinde öğrenci/veli şablon ayrımı.
   * Verilmezse veli şablonu kullanılır (mevcut davranış).
   */
  portalAccessType?: "SELF" | "GUARDIAN";
  /** İsteğe bağlı — verilirse e-posta altbilgisinde kurum iletişim bilgisi gösterilir. */
  schoolPhone?: string;
  schoolWebsite?: string;
  /** İsteğe bağlı — verilirse üst banner'da kurum ADI yerine gerçek logo gösterilir (e-postada CID eki olarak taşınır). */
  logoUrl?: string;
};

/**
 * P0 (2026-08-31) — sıcak, kurumsal, "ailemize/ekibimize hoş geldiniz"
 * tonunda hoşgeldin/hesap aktivasyon e-postası. Öğrenci/veli ve öğretmen
 * için ayrı, role uygun karşılama metni kullanır. Web portal linki AÇIK
 * metin olarak da gösterilir (yalnızca buton değil — bazı e-posta
 * istemcileri/görme engelli kullanıcılar için). Mobil app linkleri
 * SADECE `getMobileAppLinks()` gerçek bir URL döndürüyorsa (uygulama
 * yayınlandıktan sonra) gösterilir — yayınlanmamış bir uygulamaya kırık
 * bir mağaza linki ASLA gösterilmez.
 *
 * Davet e-postasını gönderir (veya SMTP yapılandırılmamışsa BLOKE olduğunu
 * açıkça bildirir — asla sahte başarı döndürmez). ASLA: düz metin şifre,
 * iç tenant ID, öğrenci/veli kişisel verisi.
 */
/** `activationLink` ASLA loglanmaz/audit'e yazılmaz — yalnız yetkili admin'e "kopyala" fallback'i için döner. */
export type InvitationSendResult = EmailSendResult & { activationLink: string };

export async function sendAccountInvitationEmail(input: SendInvitationInput): Promise<InvitationSendResult> {
  const raw = await createPasswordResetToken(input.tenantId, input.userId, INVITATION_TTL_MS);
  const activationLink = `${getAppBaseUrl()}/hesap-aktivasyon?token=${encodeURIComponent(raw)}`;
  const { appStoreUrl, playStoreUrl } = getMobileAppLinks();

  // 10. tur iş #2 — içerik şablon motorundan gelir: kurumun yayınlanmış özel
  // şablonu varsa o, yoksa varsayılan profesyonel metin. Logo, e-posta
  // istemcilerinde çalışan CID eki + metin geri dönüşüyle taşınır.
  const key: EmailTemplateKey =
    input.role === "TEACHER"
      ? "teacher_invite"
      : input.role === "SCHOOL_ADMIN"
        ? "staff_invite"
        : input.portalAccessType === "SELF"
          ? "student_invite"
          : "parent_invite";
  const values: RenderValues = {
    kurum_adi: input.institutionName,
    alici_adi: input.recipientName,
    giris_epostasi: input.email,
    gecerlilik_suresi: "7 gün",
    yil: String(new Date().getFullYear()),
    actionUrl: activationLink,
    webPortalUrl: getAppBaseUrl(),
    appStoreUrl,
    playStoreUrl,
  };
  const contactBits: string[] = [];
  if (input.schoolPhone) contactBits.push(`Telefon: ${input.schoolPhone}`);
  if (input.schoolWebsite) contactBits.push(`Web sitesi: ${input.schoolWebsite}`);
  const rendered = await renderTransactionalEmail({
    key,
    locale: "tr",
    tenantId: input.tenantId,
    values,
    institutionName: input.institutionName,
    logoUrl: input.logoUrl,
    footerLines: [
      "Bu bağlantı 7 gün içinde geçerliliğini yitirir ve yalnızca bir kez kullanılabilir.",
      "Bu daveti siz talep etmediyseniz, bu e-postayı yok sayabilirsiniz.",
      contactBits.length ? `${input.institutionName} — ${contactBits.join(" · ")}` : "Sorularınız için kurumunuzla iletişime geçebilirsiniz.",
    ],
  });

  return {
    ...(await sendEmail({
      to: input.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments: rendered.attachments,
    })),
    activationLink,
  };
}

export type SendPasswordResetInput = {
  tenantId: string;
  userId: string;
  email: string;
  recipientName: string;
  institutionName: string;
  /** İsteğe bağlı — verilirse üst banner'da kurum ADI yerine gerçek logo gösterilir (bkz. institution-logo.ts). */
  logoUrl?: string;
  /** Verilirse YENİ bir token üretilmez, bu ham değer e-postalanır — çağıran zaten
   * `createPasswordResetToken` çağırdıysa (ör. dev-mode token'ı yanıta da eklemek
   * için) token'ın İKİ KEZ üretilip birbirini geçersiz kılmasını önler. */
  rawToken?: string;
  /** Kurumun kayıtlı uygulama dili. Yoksa Türkçe. */
  locale?: "tr" | "en";
};

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // password-reset.ts TOKEN_TTL_MS ile AYNI (30 dk).

/**
 * Görev: "Şifresini unutan kullanıcı için güvenli şifre sıfırlama e-postası
 * gönderebilmeli" — admin, öğrenci/öğretmen detay ekranından tetikler.
 * AYNI `createPasswordResetToken` altyapısını kullanır (`sendAccountInvitationEmail`
 * ile paralel desen) — yeni bir token tablosu/mekanizması EKLEMEZ. Kod, hem
 * tıklanabilir bir link olarak (`?token=`) hem de düz metin olarak (elle
 * girilebilmesi için, bkz. password-reset.ts CODE_ALPHABET tasarım notu)
 * e-postada yer alır. Bu FONKSİYON, `/api/v1/auth/forgot-password` (kendi
 * kendine "şifremi unuttum") tarafından da kullanılır — o uçtan ÖNCE hiçbir
 * e-posta gönderilmiyordu (yalnızca dev ortamında yanıt gövdesine token
 * ekleniyordu), bu KRİTİK bir eksiklikti (bkz. final rapor); artık iki
 * çağıran da (admin-tetikli VE kendi-kendine) AYNI e-postayı gönderir.
 */
export async function sendPasswordResetEmail(input: SendPasswordResetInput): Promise<EmailSendResult> {
  const raw = input.rawToken ?? (await createPasswordResetToken(input.tenantId, input.userId, PASSWORD_RESET_TTL_MS));
  const { getPublicAppBaseUrl } = await import("../email/config");
  const resetLink = `${getPublicAppBaseUrl()}/sifre-sifirla?token=${encodeURIComponent(raw)}`;
  const locale = input.locale === "en" ? "en" : "tr";

  // 10. tur iş #2 — içerik şablon motorundan gelir (kurum özel şablonu ya da
  // varsayılan; tr+en korunur). Kod etiketi varsayılan gövdede
  // `passwordResetMail(...).codeLabel` ile BİREBİR aynı metindir (mevcut
  // regresyon testleri buna dayanır).
  const { passwordResetMail } = await import("../i18n/copy");
  const copy = passwordResetMail(locale, input.institutionName);
  const values: RenderValues = {
    kurum_adi: input.institutionName,
    alici_adi: input.recipientName,
    giris_epostasi: input.email,
    gecerlilik_suresi: locale === "en" ? "30 minutes" : "30 dakika",
    yil: String(new Date().getFullYear()),
    actionUrl: resetLink,
    code: raw,
  };
  const rendered = await renderTransactionalEmail({
    key: "password_reset",
    locale,
    tenantId: input.tenantId,
    values,
    institutionName: input.institutionName,
    logoUrl: input.logoUrl,
    footerLines: [copy.expiry, copy.ignore],
  });

  return sendEmail({
    to: input.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments: rendered.attachments,
  });
}

/**
 * Davet kabul edildiğinde (yeni şifre belirlendikten SONRA) çağrılır — bu
 * kullanıcı için `invited` durumunda bekleyen TÜM `StudentPortalAccess`
 * satırlarını `active` yapar (veli/öğrenci portalı). Öğretmen davetlerinde
 * ilgili satır yoktur, no-op. Best-effort: tek bir satırın aktivasyonu
 * başarısız olsa bile şifre zaten belirlenmiştir, kabul akışı BAŞARISIZ
 * SAYILMAZ.
 */
export async function activatePendingPortalAccessForUser(tenantId: string, userId: string): Promise<number> {
  const { listAccessForUser, activateStudentPortalAccess } = await import("../student-portal-access");
  const rows = await listAccessForUser(tenantId, userId);
  const pending = rows.filter((r) => r.status === "invited");
  let activated = 0;
  for (const row of pending) {
    const ok = await activateStudentPortalAccess(tenantId, userId, row.studentId);
    if (ok) activated += 1;
  }
  return activated;
}
