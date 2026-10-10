/**
 * Hesabım — e-posta değiştirme akışı (2026-09-11, kullanıcı isteği).
 * TÜM roller kendi hesabından kullanır (userId session'dan gelir, body'den
 * ASLA). Mevcut şifre-sıfırlama/davet token altyapısı TEKRAR EDİLMEZ —
 * ayrı amaç (yeni e-posta bağlama) ayrı tablo gerektirdiği için AYNI desenle
 * yeni `email-change-tokens` deposu kuruldu (dosya + Prisma; migration DOSYA
 * olarak eklendi, UYGULANMADI).
 *
 * GÜVENLİK KONTROLLERİ (mevcut e-postalar dahil):
 *  1. İstek anında mevcut şifre istenir (oturum çalınmasına karşı).
 *  2. Doğrulama bağlantısı YENİ adrese gider (yeni kutunun sahipliği kanıtlanır).
 *  3. ESKİ adrese güvenlik bildirimi gider (yetkisiz değişiklikte uyarı).
 *  4. Token tek kullanımlık + 24 saat TTL; ham token ASLA saklanmaz/loglanmaz.
 *  5. Onay anında yeni adresin hâlâ boş olduğu tekrar kontrol edilir (yarış).
 *  6. Tenant-dışı e-posta çakışması engellenir (tenant kapsamlı benzersizlik).
 */
import crypto from "crypto";
import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

export type EmailChangeTokenRow = {
  id: string;
  tenantId: string;
  userId: string;
  newEmail: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "email-change-tokens.json");

export const EMAIL_CHANGE_TOKENS_FILE = FILE;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

async function loadAll(): Promise<EmailChangeTokenRow[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as EmailChangeTokenRow[];
  } catch {
    return [];
  }
}

async function saveAll(rows: EmailChangeTokenRow[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

export function normalizeEmailChangeAddress(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmailChangeAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export type RequestEmailChangeResult =
  | { ok: true; sentToNew: boolean; notifiedOld: boolean; devToken?: string }
  | { ok: false; code: "USER_NOT_FOUND" | "WRONG_PASSWORD" | "SAME_EMAIL" | "INVALID_EMAIL" | "TAKEN" | "RATE_LIMITED" | "SEND_FAILED" };

/**
 * E-posta değişikliği ister: şifreyi doğrular, tek kullanımlık token üretir,
 * YENİ adrese doğrulama bağlantısı + ESKİ adrese güvenlik bildirimi gönderir.
 * E-posta sağlayıcısı yoksa (local) gönderim BLOKE sayılır ama token üretilir;
 * `devToken` yalnız yanıtta (bir kerelik) döner — sahte başarı YOK.
 */
export async function requestEmailChange(input: {
  tenantId: string;
  userId: string;
  currentPassword: string;
  newEmail: string;
  institutionName?: string;
}): Promise<RequestEmailChangeResult> {
  const newEmail = normalizeEmailChangeAddress(input.newEmail);
  if (!isValidEmailChangeAddress(newEmail)) return { ok: false, code: "INVALID_EMAIL" };

  const { getUserById, getUserIdByEmail } = await import("./users");
  const { verifyPassword } = await import("./password");
  const { isRateLimited } = await import("./password-reset");
  const { sendEmail, getPublicAppBaseUrl } = await import("../email");
  const { auditLog } = await import("./audit");

  const user = await getUserById(input.userId);
  // Not: getUserById pasif kullanıcı için null döner (aktiflik filtresi içeride).
  if (!user || user.tenantId !== input.tenantId) return { ok: false, code: "USER_NOT_FOUND" };

  const currentEmail = (user.email ?? "").toLowerCase();
  if (currentEmail === newEmail) return { ok: false, code: "SAME_EMAIL" };

  const { getPasswordHashForVerify } = await import("./users");
  const currentHash = await getPasswordHashForVerify(input.userId);
  if (!currentHash || !(await verifyPassword(input.currentPassword, currentHash))) {
    return { ok: false, code: "WRONG_PASSWORD" };
  }

  const takenBy = await getUserIdByEmail(input.tenantId, newEmail);
  if (takenBy && takenBy !== input.userId) return { ok: false, code: "TAKEN" };

  if (isRateLimited(`email-change:${input.tenantId}:${input.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();
    await prisma.emailChangeToken.updateMany({ where: { userId: input.userId, usedAt: null }, data: { usedAt: new Date() } });
    await prisma.emailChangeToken.create({
      data: { id: uid("emailchg"), tenantId: input.tenantId, userId: input.userId, newEmail, tokenHash, expiresAt: new Date(expiresAt) },
    });
  } else {
    const all = await loadAll();
    const invalidated = all.map((t) => (t.userId === input.userId && !t.usedAt ? { ...t, usedAt: new Date().toISOString() } : t));
    invalidated.push({ id: uid("emailchg"), tenantId: input.tenantId, userId: input.userId, newEmail, tokenHash, expiresAt, usedAt: null, createdAt: new Date().toISOString() });
    await saveAll(invalidated);
  }

  const link = `${getPublicAppBaseUrl()}/hesap-eposta-dogrula?token=${encodeURIComponent(raw)}`;
  const institution = input.institutionName ?? "NeviiHub";
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const verify = await sendEmail({
    to: newEmail,
    subject: `${institution} — E-posta adresinizi doğrulayın`,
    html: `<p>Merhaba,</p><p>Hesabınızın giriş e-postasını <strong>${escapeHtml(newEmail)}</strong> olarak değiştirmek için 24 saat içinde şu bağlantıyı açın:</p><p><a href="${link}">E-posta adresimi doğrula</a></p><p>Bağlantı çalışmıyorsa: ${link}</p><p>Bu isteği siz yapmadıysanız bu e-postayı yok sayın.</p>`,
    text: `Hesabınızın giriş e-postasını ${newEmail} olarak değiştirmek için 24 saat içinde şu bağlantıyı açın: ${link}\nBu isteği siz yapmadıysanız yok sayın.`,
  });

  // Güvenlik bildirimi ESKİ adrese (değişiklik yetkisizse kullanıcı uyarılır).
  let notifiedOld = false;
  if (currentEmail) {
    try {
      const notice = await sendEmail({
        to: currentEmail,
        subject: `${institution} — Hesap e-postanız değiştirilmek isteniyor`,
        html: `<p>Merhaba,</p><p>Hesabınız için e-posta değişikliği istendi. Yeni adres: <strong>${escapeHtml(newEmail)}</strong>.</p><p>Bu isteği SİZ yapmadıysanız hemen kurumunuzla iletişime geçin ve şifrenizi değiştirin.</p>`,
        text: `Hesabınız için e-posta değişikliği istendi. Yeni adres: ${newEmail}. Bu isteği SİZ yapmadıysanız hemen kurumunuzla iletişime geçin ve şifrenizi değiştirin.`,
      });
      notifiedOld = notice.delivered;
    } catch {
      notifiedOld = false;
    }
  }

  auditLog({
    action: "auth.email_change_requested",
    requestId: uid("req"),
    userId: input.userId,
    tenantId: input.tenantId,
    role: user.role,
    outcome: "success",
  });

  if (!verify.delivered) {
    // Local/provider yok: token üretildi ama bağlantı ulaşmadı — dev yanıtta
    // ham token döner (yanıtı gören hesap sahibi test edebilir).
    return { ok: true, sentToNew: false, notifiedOld, devToken: raw };
  }
  return { ok: true, sentToNew: true, notifiedOld };
}

export type ConfirmEmailChangeResult =
  | { ok: true; newEmail: string }
  | { ok: false; code: "INVALID_TOKEN" | "EXPIRED" | "TAKEN" | "USER_NOT_FOUND" | "UPDATE_FAILED" };

/** Doğrulama bağlantısından e-postayı kesinleştirir (tek kullanımlık). */
export async function confirmEmailChange(rawToken: string): Promise<ConfirmEmailChangeResult> {
  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  let row: EmailChangeTokenRow | null = null;
  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();
    const found = await prisma.emailChangeToken.findFirst({ where: { tokenHash } });
    if (found) {
      row = {
        id: found.id,
        tenantId: found.tenantId,
        userId: found.userId,
        newEmail: found.newEmail,
        tokenHash: found.tokenHash,
        expiresAt: found.expiresAt.toISOString(),
        usedAt: found.usedAt ? found.usedAt.toISOString() : null,
        createdAt: found.createdAt.toISOString(),
      };
    }
  } else {
    row = (await loadAll()).find((t) => t.tokenHash === tokenHash) ?? null;
  }
  if (!row) return { ok: false, code: "INVALID_TOKEN" };
  if (row.usedAt) return { ok: false, code: "INVALID_TOKEN" };
  if (new Date(row.expiresAt) <= now) return { ok: false, code: "EXPIRED" };

  const markUsed = async () => {
    if (isDbMode) {
      const { getPrisma } = await import("../db");
      await getPrisma().emailChangeToken.update({ where: { id: row!.id }, data: { usedAt: new Date() } });
    } else {
      const all = await loadAll();
      await saveAll(all.map((t) => (t.id === row!.id ? { ...t, usedAt: new Date().toISOString() } : t)));
    }
  };

  const { getUserById, getUserIdByEmail, updateUserEmail } = await import("./users");
  const { auditLog } = await import("./audit");
  const user = await getUserById(row.userId);
  if (!user || user.tenantId !== row.tenantId) {
    await markUsed();
    return { ok: false, code: "USER_NOT_FOUND" };
  }
  const takenBy = await getUserIdByEmail(row.tenantId, row.newEmail);
  if (takenBy && takenBy !== row.userId) {
    await markUsed();
    return { ok: false, code: "TAKEN" };
  }

  const updated = await updateUserEmail(row.userId, row.newEmail);
  await markUsed();
  if (!updated) return { ok: false, code: "UPDATE_FAILED" };

  auditLog({
    action: "auth.email_changed",
    requestId: uid("req"),
    userId: row.userId,
    tenantId: row.tenantId,
    role: user.role,
    outcome: "success",
  });
  return { ok: true, newEmail: row.newEmail };
}
