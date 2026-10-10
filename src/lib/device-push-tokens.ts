/**
 * Push cihaz token deposu — `notification-preferences.ts` ile AYNI ikili
 * (json/memory dosya ↔ DB) desen. Token DEĞERİ yanıtlarda/loglarda ASLA
 * dönmez; tüm okuma/yazma tenantId+userId kapsamlıdır.
 */
import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "device-push-tokens.json");

/** Resolved store path — exposed so tests clean up the same file the module writes. */
export const DEVICE_PUSH_TOKENS_FILE = FILE;

export type PushPlatform = "ios" | "android";
export type PushAppVariant = "development" | "preview" | "production";
export type PushPermissionState = "granted" | "denied" | "undetermined";

export type DevicePushTokenRecord = {
  id: string;
  tenantId: string;
  userId: string;
  platform: PushPlatform;
  expoPushToken: string;
  appVariant: PushAppVariant;
  deviceId: string | null;
  permission: PushPermissionState;
  enabled: boolean;
  lastSeenAt: string;
};

type StoredToken = DevicePushTokenRecord & { createdAt: string; updatedAt: string };

async function loadAll(): Promise<StoredToken[]> {
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as StoredToken[];
  } catch {
    return [];
  }
}

async function saveAll(rows: StoredToken[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function toRecord(r: StoredToken): DevicePushTokenRecord {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userId: r.userId,
    platform: r.platform,
    expoPushToken: r.expoPushToken,
    appVariant: r.appVariant,
    deviceId: r.deviceId,
    permission: r.permission,
    enabled: r.enabled,
    lastSeenAt: r.lastSeenAt,
  };
}

/**
 * Idempotent kayıt/güncelleme — aynı (tenant,user,token) tekrar gelirse
 * satır güncellenir, ikinci satır ASLA oluşmaz. Dönen kayıtta token değeri
 * MASKELENİR (son 6 karakter) — log/yanıt güvenliği.
 */
export async function registerDevicePushToken(input: {
  tenantId: string;
  userId: string;
  platform: PushPlatform;
  expoPushToken: string;
  appVariant?: PushAppVariant;
  deviceId?: string;
  permission?: PushPermissionState;
}): Promise<DevicePushTokenRecord> {
  const now = new Date().toISOString();
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.devicePushToken.upsert({
      where: {
        tenantId_userId_expoPushToken: {
          tenantId: input.tenantId,
          userId: input.userId,
          expoPushToken: input.expoPushToken,
        },
      },
      create: {
        id: uid("pushtoken"),
        tenantId: input.tenantId,
        userId: input.userId,
        platform: input.platform,
        expoPushToken: input.expoPushToken,
        appVariant: input.appVariant ?? "production",
        deviceId: input.deviceId ?? null,
        permission: input.permission ?? "granted",
        enabled: true,
        lastSeenAt: new Date(now),
      },
      update: {
        platform: input.platform,
        appVariant: input.appVariant ?? "production",
        deviceId: input.deviceId ?? null,
        permission: input.permission ?? "granted",
        enabled: true,
        lastSeenAt: new Date(now),
      },
    });
    return toRecord({
      ...row,
      platform: row.platform as PushPlatform,
      appVariant: row.appVariant as PushAppVariant,
      permission: row.permission as PushPermissionState,
      deviceId: row.deviceId,
      lastSeenAt: row.lastSeenAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  const all = await loadAll();
  const idx = all.findIndex(
    (r) => r.tenantId === input.tenantId && r.userId === input.userId && r.expoPushToken === input.expoPushToken
  );
  const base: StoredToken =
    idx >= 0
      ? all[idx]!
      : {
          id: uid("pushtoken"),
          tenantId: input.tenantId,
          userId: input.userId,
          platform: input.platform,
          expoPushToken: input.expoPushToken,
          createdAt: now,
          updatedAt: now,
          appVariant: "production",
          deviceId: null,
          permission: "undetermined",
          enabled: true,
          lastSeenAt: now,
        };
  const next: StoredToken = {
    ...base,
    platform: input.platform,
    appVariant: input.appVariant ?? base.appVariant,
    deviceId: input.deviceId ?? base.deviceId,
    permission: input.permission ?? "granted",
    enabled: true,
    lastSeenAt: now,
    updatedAt: now,
  };
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await saveAll(all);
  return toRecord(next);
}

/** Gönderim hedefleri — yalnız enabled + permission granted cihazlar. */
export async function listEnabledDevicePushTokens(
  tenantId: string,
  userId: string
): Promise<DevicePushTokenRecord[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.devicePushToken.findMany({ where: { tenantId, userId, enabled: true } });
    return rows
      .filter((r) => r.permission === "granted")
      .map((r) =>
        toRecord({
          ...r,
          platform: r.platform as PushPlatform,
          appVariant: r.appVariant as PushAppVariant,
          permission: r.permission as PushPermissionState,
          deviceId: r.deviceId,
          lastSeenAt: r.lastSeenAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })
      );
  }
  return (await loadAll())
    .filter((r) => r.tenantId === tenantId && r.userId === userId && r.enabled && r.permission === "granted")
    .map(toRecord);
}

/** Logout/token-invalidation — yalnız kendi (tenant,user) satırları. */
export async function disableDevicePushTokens(
  tenantId: string,
  userId: string,
  expoPushToken?: string
): Promise<number> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const res = await prisma.devicePushToken.updateMany({
      where: expoPushToken ? { tenantId, userId, expoPushToken } : { tenantId, userId },
      data: { enabled: false },
    });
    return res.count;
  }
  const all = await loadAll();
  let count = 0;
  for (const r of all) {
    if (r.tenantId !== tenantId || r.userId !== userId) continue;
    if (expoPushToken && r.expoPushToken !== expoPushToken) continue;
    if (r.enabled) {
      r.enabled = false;
      r.updatedAt = new Date().toISOString();
      count++;
    }
  }
  await saveAll(all);
  return count;
}

/** Maskeli token — log/audit/yanıt için ham değer ASLA kullanılmaz. */
export function maskPushToken(token: string): string {
  if (token.length <= 10) return "***";
  return `${token.slice(0, 6)}…${token.slice(-6)}`;
}
