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
import { institutionLogoHtml } from "../institution-logo";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün — davet e-postası hemen açılmayabilir.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  /** İsteğe bağlı — verilirse e-posta altbilgisinde kurum iletişim bilgisi gösterilir. */
  schoolPhone?: string;
  schoolWebsite?: string;
  /** İsteğe bağlı — verilirse üst banner'da kurum ADI yerine gerçek logo gösterilir (bkz. institution-logo.ts). */
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
  const webPortalLink = getAppBaseUrl();
  const { appStoreUrl, playStoreUrl } = getMobileAppLinks();
  const expiryText = "7 gün";

  const institution = escapeHtml(input.institutionName);
  const name = escapeHtml(input.recipientName);

  const isTeacher = input.role === "TEACHER";
  const isStaff = input.role === "SCHOOL_ADMIN";
  const welcomeLine = isTeacher
    ? `${institution} ekibine hoş geldiniz! Sizi aramızda görmekten çok mutluyuz.`
    : isStaff
      ? `${institution} yönetim ekibine hoş geldiniz! Sizi aramızda görmekten çok mutluyuz.`
      : `${institution} ailesine hoş geldiniz! Sizi aramızda görmekten çok mutluyuz.`;
  const introLine = isTeacher
    ? `Kurumumuzda öğretmen hesabınız oluşturuldu — ders programınızı, öğrencilerinizi ve tüm süreçlerinizi tek yerden yönetebileceksiniz.`
    : isStaff
      ? `Kurumumuzda sizin için bir yönetim paneli hesabı oluşturuldu — öğrenci, program, yoklama ve tahsilat süreçlerini yetkiniz ölçüsünde tek yerden yönetebileceksiniz.`
      : `Öğrenciniz için kurumumuzda bir hesap oluşturuldu — program, yoklama, telafi ve ödeme bilgilerinizi tek yerden takip edebileceksiniz.`;

  const contactLines: string[] = [];
  if (input.schoolPhone) contactLines.push(`Telefon: ${escapeHtml(input.schoolPhone)}`);
  if (input.schoolWebsite) contactLines.push(`Web sitesi: ${escapeHtml(input.schoolWebsite)}`);

  const appLinksHtml =
    appStoreUrl || playStoreUrl
      ? `
      <tr><td style="padding:0 32px 24px;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Mobil uygulamamızı da indirebilirsiniz:</p>
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${appStoreUrl ? `<td style="padding-right:8px;"><a href="${appStoreUrl}" style="display:inline-block;padding:8px 14px;border:1px solid #d1d5db;border-radius:6px;color:#111827;text-decoration:none;font-size:13px;">App Store</a></td>` : ""}
          ${playStoreUrl ? `<td><a href="${playStoreUrl}" style="display:inline-block;padding:8px 14px;border:1px solid #d1d5db;border-radius:6px;color:#111827;text-decoration:none;font-size:13px;">Google Play</a></td>` : ""}
        </tr></table>
      </td></tr>`
      : "";
  const appLinksText =
    appStoreUrl || playStoreUrl
      ? `\nMobil uygulama:${appStoreUrl ? `\n- App Store: ${appStoreUrl}` : ""}${playStoreUrl ? `\n- Google Play: ${playStoreUrl}` : ""}\n`
      : "";

  const subject = `${institution} — Ailemize/Ekibimize Hoş Geldiniz, Hesabınızı Aktifleştirin`;

  const html = `
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f2f8;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#ffffff;padding:28px 32px 20px;text-align:center;border-bottom:1px solid #e5e7eb;">
          ${institutionLogoHtml(input.logoUrl, input.institutionName)}
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${welcomeLine}</h1>
          <p style="margin:0 0 4px;font-size:15px;color:#374151;">Merhaba ${name},</p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${introLine}</p>
          <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Giriş e-postanız</p>
          <p style="margin:0 0 20px;font-size:15px;color:#111827;font-weight:600;">${escapeHtml(input.email)}</p>
        </td></tr>
        <tr><td style="padding:0 32px 8px;">
          <p style="margin:0 0 16px;font-size:14px;color:#374151;">Hesabınızı aktifleştirmek ve kendi şifrenizi belirlemek için:</p>
          <p style="margin:0 0 20px;"><a href="${activationLink}" style="display:inline-block;padding:12px 24px;background:#d97706;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Şifrenizi Oluşturun</a></p>
          <p style="margin:0 0 24px;font-size:12px;color:#9ca3af;word-break:break-all;">Bağlantı çalışmıyorsa: ${activationLink}</p>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Şifrenizi belirledikten sonra web portalımıza her zaman şuradan ulaşabilirsiniz:</p>
          <p style="margin:0;font-size:14px;"><a href="${webPortalLink}" style="color:#4f46e5;text-decoration:none;">${webPortalLink}</a></p>
        </td></tr>
        ${appLinksHtml}
        <tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">Bu bağlantı ${expiryText} içinde geçerliliğini yitirir ve yalnızca bir kez kullanılabilir.</p>
          <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">Bu daveti siz talep etmediyseniz, bu e-postayı yok sayabilirsiniz.</p>
          ${contactLines.length ? `<p style="margin:0;font-size:12px;color:#9ca3af;">${institution} — ${contactLines.map(escapeHtml).join(" · ")}</p>` : `<p style="margin:0;font-size:12px;color:#9ca3af;">Sorularınız için kurumunuzla iletişime geçebilirsiniz.</p>`}
        </td></tr>
      </table>
    </td></tr>
  </table>`;

  const text = `${institution}\n\n${welcomeLine}\n\nMerhaba ${input.recipientName},\n\n${introLine}\n\nGiriş e-postanız: ${input.email}\n\nHesabınızı aktifleştirmek için: ${activationLink}\n(${expiryText} içinde geçerli, tek kullanımlık)\n\nWeb portal: ${webPortalLink}\n${appLinksText}\nBu daveti siz talep etmediyseniz yok sayabilirsiniz.${contactLines.length ? `\n\n${institution} — ${contactLines.join(" · ")}` : ""}`;

  return { ...(await sendEmail({ to: input.email, subject, html, text })), activationLink };
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
  const { passwordResetMail } = await import("../i18n/copy");
  const resetLink = `${getPublicAppBaseUrl()}/sifre-sifirla?token=${encodeURIComponent(raw)}`;
  const copy = passwordResetMail(input.locale === "en" ? "en" : "tr", input.institutionName);
  const name = escapeHtml(input.recipientName);
  const greeting = input.locale === "en" ? `Hello ${name},` : `Merhaba ${name},`;

  const html = `
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f2f8;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#ffffff;padding:28px 32px 20px;text-align:center;border-bottom:1px solid #e5e7eb;">
          ${institutionLogoHtml(input.logoUrl, input.institutionName)}
        </td></tr>
        <tr><td style="padding:32px 32px 8px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${escapeHtml(copy.heading)}</h1>
          <p style="margin:0 0 4px;font-size:15px;color:#374151;">${greeting}</p>
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(copy.intro)}</p>
          <p style="margin:0 0 20px;"><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#146c3a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(copy.button)}</a></p>
          <p style="margin:0 0 8px;font-size:13px;color:#4b5563;">${escapeHtml(copy.codeLabel)}</p>
          <p style="margin:0 0 20px;padding:14px 20px;background:#f3f4f6;border-radius:8px;text-align:center;font-size:22px;font-weight:700;letter-spacing:0.08em;color:#111827;">${escapeHtml(raw)}</p>
          <p style="margin:0 0 24px;font-size:12px;color:#9ca3af;word-break:break-all;">${resetLink}</p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">${escapeHtml(copy.expiry)}</p>
          <p style="margin:0;font-size:12px;color:#9ca3af;">${escapeHtml(copy.ignore)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>`;

  const text = `${input.institutionName}\n\n${input.locale === "en" ? "Hello" : "Merhaba"} ${input.recipientName},\n\n${copy.intro}\n\n${resetLink}\n\n${copy.codeLabel} ${raw}\n\n${copy.ignore}`;

  return sendEmail({ to: input.email, subject: copy.subject, html, text });
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
