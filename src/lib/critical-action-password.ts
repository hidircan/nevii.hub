/**
 * Kritik işlem şifresi (2026-09-22) — kurum sahibinin öğrenci silme gibi geri
 * dönüşü zor işlemler için belirlediği, GİRİŞ ŞİFRESİNDEN AYRI şifre.
 *
 * - Yalnız bcrypt hash saklanır (plaintext hiçbir yere yazılmaz/loglanmaz).
 * - Hash `AppData`/`settings`'e MAP EDİLMEZ: sayfalar settings'i istemciye
 *   taşıyabildiği için hash bu modülün dışına çıkmaz.
 * - db: School.criticalActionPassword* kolonları; json/memory: ayrı dosya.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { hashPassword, verifyPassword } from "./auth/password";

type Row = { tenantId: string; hash: string; setAt: string; setBy: string };

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "critical-action-password.json");
export const CRITICAL_ACTION_PASSWORD_FILE = FILE;

export const CRITICAL_PASSWORD_MIN_LENGTH = 8;

async function loadAll(): Promise<Row[]> {
  try {
    const fs = await import("fs/promises");
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as Row[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function saveAll(rows: Row[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), { mode: 0o600 });
}

async function readRow(tenantId: string): Promise<Row | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const school = await prisma.school.findFirst({
      where: { tenantId },
      select: { criticalActionPasswordHash: true, criticalActionPasswordSetAt: true, criticalActionPasswordSetBy: true },
    });
    if (!school?.criticalActionPasswordHash) return null;
    return {
      tenantId,
      hash: school.criticalActionPasswordHash,
      setAt: school.criticalActionPasswordSetAt?.toISOString() ?? "",
      setBy: school.criticalActionPasswordSetBy ?? "",
    };
  }
  return (await loadAll()).find((r) => r.tenantId === tenantId) ?? null;
}

export async function getCriticalActionPasswordStatus(tenantId: string): Promise<{ configured: boolean; setAt?: string }> {
  const row = await readRow(tenantId);
  return row ? { configured: true, setAt: row.setAt || undefined } : { configured: false };
}

export async function verifyCriticalActionPassword(tenantId: string, plain: string): Promise<boolean> {
  const row = await readRow(tenantId);
  if (!row || !plain) return false;
  return verifyPassword(plain, row.hash);
}

export async function setCriticalActionPassword(tenantId: string, plain: string, actorUserId: string): Promise<void> {
  const hash = await hashPassword(plain);
  const setAt = new Date();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const res = await prisma.school.updateMany({
      where: { tenantId },
      data: { criticalActionPasswordHash: hash, criticalActionPasswordSetAt: setAt, criticalActionPasswordSetBy: actorUserId },
    });
    if (res.count === 0) throw new Error("Kurum bulunamadı");
    return;
  }
  const rows = (await loadAll()).filter((r) => r.tenantId !== tenantId);
  rows.push({ tenantId, hash, setAt: setAt.toISOString(), setBy: actorUserId });
  await saveAll(rows);
}
