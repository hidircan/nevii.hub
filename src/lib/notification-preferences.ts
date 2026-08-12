/**
 * İş 4 (yönetici bildirim tercihleri sprint'i) — kullanıcı+kategori bazlı
 * bildirim tercihi, `src/lib/notifications/index.ts` ile AYNI ikili
 * (json/memory dosya ↔ DB) desen. STORE_MODE=db → Prisma
 * NotificationPreference (bkz. prisma/schema.prisma — migration
 * ÇALIŞTIRILMADI, bkz. final rapor). STORE_MODE=json/memory → dosya
 * tabanlı store (demo/test).
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { NOTIFICATION_CATEGORIES, defaultInAppEnabled, type NotificationCategory } from "./notification-categories";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "notification-preferences.json");

/** Resolved store path — exposed so tests clean up the same file the module writes. */
export const NOTIFICATION_PREFERENCES_FILE = FILE;

export type NotificationPreference = {
  category: NotificationCategory;
  inAppEnabled: boolean;
  pushEnabled: boolean;
};

type StoredPreference = NotificationPreference & { id: string; tenantId: string; userId: string };

async function loadAll(): Promise<StoredPreference[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredPreference[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredPreference[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

/**
 * Bir kullanıcının TÜM kategoriler için etkili tercihini döner — kayıtlı
 * bir satır yoksa kategorinin rol-bağımsız varsayılanı kullanılır (bkz.
 * notification-categories.ts `defaultInAppEnabled`). Asla eksik/undefined
 * bir kategori döndürmez.
 */
export async function getNotificationPreferences(
  tenantId: string,
  userId: string
): Promise<NotificationPreference[]> {
  const overrides = isDbMode ? await getAllDb(tenantId, userId) : (await loadAll()).filter(
    (r) => r.tenantId === tenantId && r.userId === userId
  );
  const byCategory = new Map(overrides.map((o) => [o.category, o]));
  return NOTIFICATION_CATEGORIES.map((def) => {
    const existing = byCategory.get(def.category);
    return {
      category: def.category,
      inAppEnabled: existing?.inAppEnabled ?? defaultInAppEnabled(def.category),
      pushEnabled: existing?.pushEnabled ?? false,
    };
  });
}

async function getAllDb(tenantId: string, userId: string): Promise<StoredPreference[]> {
  const { prisma } = await import("./db");
  const rows = await prisma.notificationPreference.findMany({ where: { tenantId, userId } });
  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    category: r.category as NotificationCategory,
    inAppEnabled: r.inAppEnabled,
    pushEnabled: r.pushEnabled,
  }));
}

/** Tek bir kategori için etkili in-app tercihini döner — olay üreticileri (notifyAdmins vb.) bunu kullanır. */
export async function isCategoryEnabledForUser(
  tenantId: string,
  userId: string,
  category: NotificationCategory
): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.notificationPreference.findUnique({
      where: { tenantId_userId_category: { tenantId, userId, category } },
    });
    return row?.inAppEnabled ?? defaultInAppEnabled(category);
  }
  const all = await loadAll();
  const row = all.find((r) => r.tenantId === tenantId && r.userId === userId && r.category === category);
  return row?.inAppEnabled ?? defaultInAppEnabled(category);
}

export type SetPreferenceInput = { category: NotificationCategory; inAppEnabled: boolean; pushEnabled?: boolean };

/** Toplu upsert — "Tümünü aç/kapat"/tekil toggle hepsi buradan geçer. Yalnızca kendi (tenant, userId) satırlarını yazar. */
export async function setNotificationPreferences(
  tenantId: string,
  userId: string,
  updates: SetPreferenceInput[]
): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await Promise.all(
      updates.map((u) =>
        prisma.notificationPreference.upsert({
          where: { tenantId_userId_category: { tenantId, userId, category: u.category } },
          create: {
            id: uid("notifpref"),
            tenantId,
            userId,
            category: u.category,
            inAppEnabled: u.inAppEnabled,
            pushEnabled: u.pushEnabled ?? false,
          },
          update: { inAppEnabled: u.inAppEnabled, pushEnabled: u.pushEnabled ?? false },
        })
      )
    );
    return;
  }
  const all = await loadAll();
  const byKey = new Map(all.map((r) => [`${r.tenantId}:${r.userId}:${r.category}`, r]));
  for (const u of updates) {
    const key = `${tenantId}:${userId}:${u.category}`;
    const existing = byKey.get(key);
    byKey.set(key, {
      id: existing?.id ?? uid("notifpref"),
      tenantId,
      userId,
      category: u.category,
      inAppEnabled: u.inAppEnabled,
      pushEnabled: u.pushEnabled ?? false,
    });
  }
  await saveAll(Array.from(byKey.values()));
}

/** Kullanıcının bu tenant içindeki TÜM tercih override'larını siler — "Varsayılana dön". */
export async function resetNotificationPreferences(tenantId: string, userId: string): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.notificationPreference.deleteMany({ where: { tenantId, userId } });
    return;
  }
  const all = await loadAll();
  const remaining = all.filter((r) => !(r.tenantId === tenantId && r.userId === userId));
  if (remaining.length !== all.length) await saveAll(remaining);
}
