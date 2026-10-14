/**
 * Şifremi unuttum akışı — token deposu. `profile-photos.ts` ile AYNI desen:
 * STORE_MODE=db → Prisma PasswordResetToken, json/memory → dosya tabanlı.
 * Ham token ASLA saklanmaz/loglanmaz — yalnızca sha256 hash'i, ve yalnızca
 * üretildiği HTTP yanıtında (bir kerelik) dolaşır.
 */
import crypto from "crypto";
import path from "path";
import { isDbMode, resolveDataDir } from "../config";
import { uid } from "../utils";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 dakika

/** Belirsiz karakterler (0/O, 1/I/L) hariç — kullanıcının elle yazması gereken bir kod, e-posta deep-link'i değil. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

function generateResetCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Kullanıcının elle girdiği kodu normalize eder (boşluk/küçük harf toleranslı karşılaştırma için). */
export function normalizeResetCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export type PasswordResetTokenRow = {
  id: string;
  tenantId: string;
  userId: string;
  purpose?: "password_reset" | "invitation";
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

const LEGACY_INVITATION_TTL_MS = 6 * 24 * 60 * 60 * 1000;

function isInvitationToken(token: PasswordResetTokenRow): boolean {
  if (token.purpose === "invitation") return true;
  if (token.purpose) return false;
  return new Date(token.expiresAt).getTime() - new Date(token.createdAt).getTime() > LEGACY_INVITATION_TTL_MS;
}

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "password-reset-tokens.json");

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function loadAll(): Promise<PasswordResetTokenRow[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as PasswordResetTokenRow[];
  } catch {
    return [];
  }
}

async function saveAll(rows: PasswordResetTokenRow[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

/**
 * Yeni bir sıfırlama/davet token'ı üretir; aynı kullanıcının önceki
 * kullanılmamış token'larını geçersiz kılar. Ham token'ı (bir kerelik,
 * hash'lenmeden önce) döner. `ttlMs` — varsayılan 30 dk (şifremi unuttum);
 * hesap daveti (`src/lib/auth/invitation.ts`) daha uzun bir süre geçirir
 * (kullanıcı e-postayı hemen açmayabilir) — AYNI token altyapısı, yalnızca
 * süre farklı, ayrı bir tablo/mekanizma DEĞİL (kural: mevcut şifre
 * sıfırlama/davet altyapısı yeniden kullanılmalı, tekrar edilmemeli).
 */
export async function createPasswordResetToken(
  tenantId: string,
  userId: string,
  ttlMs: number = TOKEN_TTL_MS,
  purpose: "password_reset" | "invitation" = "password_reset"
): Promise<string> {
  const raw = generateResetCode();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();
    await prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.passwordResetToken.create({
      data: { id: uid("pwreset"), tenantId, userId, purpose, tokenHash, expiresAt: new Date(expiresAt) },
    });
    return raw;
  }

  const all = await loadAll();
  const invalidated = all.map((t) => (t.userId === userId && !t.usedAt ? { ...t, usedAt: new Date().toISOString() } : t));
  invalidated.push({
    id: uid("pwreset"),
    tenantId,
    userId,
    purpose,
    tokenHash,
    expiresAt,
    usedAt: null,
    createdAt: new Date().toISOString(),
  });
  await saveAll(invalidated);
  return raw;
}

/** Daveti kabul edilmemiş öğretmenin geçerli davet bağlantısı var mı? */
export async function hasActiveInvitationToken(tenantId: string, userId: string): Promise<boolean> {
  const now = new Date();
  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const row = await getPrisma().passwordResetToken.findFirst({
      where: { tenantId, userId, purpose: "invitation", usedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    return Boolean(row);
  }
  const all = await loadAll();
  return all.some((token) =>
    token.tenantId === tenantId &&
    token.userId === userId &&
    isInvitationToken(token) &&
    token.usedAt === null &&
    new Date(token.expiresAt) > now
  );
}

/** Eski dosya tabanlı davetlerde purpose alanı yoktur; uzun TTL ayırt edicidir. */
export async function hasUnacceptedInvitationToken(tenantId: string, userId: string): Promise<boolean> {
  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const row = await getPrisma().passwordResetToken.findFirst({
      where: { tenantId, userId, purpose: "invitation", usedAt: null },
      select: { id: true },
    });
    return Boolean(row);
  }
  const all = await loadAll();
  return all.some(
    (token) =>
      token.tenantId === tenantId &&
      token.userId === userId &&
      isInvitationToken(token) &&
      token.usedAt === null
  );
}

/** Profil iletişim adresi değişince yalnızca davet token'larını geçersiz kılar. */
export async function revokeInvitationTokensForUser(tenantId: string, userId: string): Promise<void> {
  const now = new Date();
  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();
    const legacyRows = await prisma.passwordResetToken.findMany({
      where: { tenantId, userId, usedAt: null },
      select: { id: true, purpose: true, expiresAt: true, createdAt: true },
    });
    const legacyIds = legacyRows
      .filter((token) =>
        token.purpose === "invitation" ||
        (!token.purpose && token.expiresAt.getTime() - token.createdAt.getTime() > LEGACY_INVITATION_TTL_MS)
      )
      .map((token) => token.id);
    if (legacyIds.length) {
      await prisma.passwordResetToken.updateMany({
        where: { tenantId, userId, id: { in: legacyIds }, usedAt: null },
        data: { usedAt: now },
      });
    }
    return;
  }
  const all = await loadAll();
  const next = all.map((token) =>
    token.tenantId === tenantId &&
    token.userId === userId &&
    isInvitationToken(token) &&
    token.usedAt === null
      ? { ...token, usedAt: now.toISOString() }
      : token
  );
  await saveAll(next);
}

/** Ham token'ı doğrular, geçerliyse "kullanıldı" işaretler (tek kullanımlık) ve sahibinin userId/tenantId'sini döner. */
export async function consumePasswordResetToken(
  rawToken: string
): Promise<{ userId: string; tenantId: string } | null> {
  const tokenHash = hashToken(normalizeResetCode(rawToken));
  const now = new Date();

  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();
    const row = await prisma.passwordResetToken.findFirst({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt < now) return null;
    await prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: now } });
    return { userId: row.userId, tenantId: row.tenantId };
  }

  const all = await loadAll();
  const idx = all.findIndex((t) => t.tokenHash === tokenHash);
  if (idx < 0) return null;
  const row = all[idx]!;
  if (row.usedAt || new Date(row.expiresAt) < now) return null;
  const next = [...all];
  next[idx] = { ...row, usedAt: now.toISOString() };
  await saveAll(next);
  return { userId: row.userId, tenantId: row.tenantId };
}

/**
 * Bir kullanıcı için en SON oluşturulan sıfırlama/davet kaydının zamanı —
 * kullanılmış/süresi dolmuş olsa bile (admin ekranında "son gönderim
 * zamanı" göstermek için — bkz. görev talebi). Ham kod DÖNMEZ, yalnızca
 * zaman damgası.
 */
export async function getLatestPasswordResetRequestAt(userId: string): Promise<string | null> {
  if (isDbMode) {
    const { getPrisma } = await import("../db");
    const prisma = getPrisma();
    const row = await prisma.passwordResetToken.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return row ? row.createdAt.toISOString() : null;
  }
  const all = await loadAll();
  const rows = all.filter((t) => t.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return rows[0]?.createdAt ?? null;
}

// ponytail: process-lifetime in-memory sliding-window limiter — no Redis/shared
// store in this codebase yet, matches the existing per-process override pattern
// (bkz. auth/users.ts passwordOverrides). Upgrade to a shared store if this runs
// multi-instance.
const attemptLog = new Map<string, number[]>();

/** Basit istek başına limit (ör. e-posta veya IP anahtarıyla) — kaba kuvvetle token/hesap keşfini zorlaştırır. */
export function isRateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const attempts = (attemptLog.get(key) ?? []).filter((t) => now - t < windowMs);
  attempts.push(now);
  attemptLog.set(key, attempts);
  return attempts.length > maxAttempts;
}
