/**
 * Faz 8 — genelleştirilmiş KVKK açık rıza yönetimi. `social-media-consent.ts`
 * ile AYNI iskelet (isDbMode ? prisma : JSON dosyası, append-only tarihçe —
 * hiçbir satır güncellenmez, her değişiklik yeni bir satır). İki bağımsız
 * kavram burada yaşar:
 *
 *   1. ConsentTextVersion — hukuki metnin versiyonlu geçmişi (bir
 *      `consentType` için her düzenleme YENİ bir satır, `version` +1).
 *   2. KvkkConsent — bir konunun (`subjectType`+`subjectId`) belirli bir
 *      `textVersionId`e verdiği onay/geri çekme kaydı.
 *
 * `getEffectiveConsentStatus` bu ikisini birleştirir: konunun EN GÜNCEL
 * onayı, metnin EN GÜNCEL (effectiveFrom <= now) versiyonuyla eşleşmiyorsa
 * "outdated" döner — metin değiştiğinde otomatik olarak yeniden-rıza
 * gerektirir, hiçbir ayrı "reconsent tetikleme" mekanizması İCAT EDİLMEDİ,
 * bu karşılaştırmanın kendisi yeterli.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type { ConsentTextVersion, KvkkConsent, ConsentSubjectType, ConsentEffectiveStatus, ConsentSettings } from "./types";

const TEXT_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "consent-text-versions.json");
const CONSENT_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "kvkk-consents.json");
export const CONSENT_TEXT_VERSIONS_FILE = TEXT_FILE;
export const KVKK_CONSENTS_FILE = CONSENT_FILE;

type StoredText = ConsentTextVersion & { tenantId: string };
type StoredConsent = KvkkConsent & { tenantId: string };

async function loadAllText(): Promise<StoredText[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(TEXT_FILE, "utf8")) as StoredText[];
  } catch {
    return [];
  }
}
async function saveAllText(rows: StoredText[]) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(TEXT_FILE), { recursive: true });
  await fs.writeFile(TEXT_FILE, JSON.stringify(rows, null, 2));
}

async function loadAllConsent(): Promise<StoredConsent[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(CONSENT_FILE, "utf8")) as StoredConsent[];
  } catch {
    return [];
  }
}
async function saveAllConsent(rows: StoredConsent[]) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(CONSENT_FILE), { recursive: true });
  await fs.writeFile(CONSENT_FILE, JSON.stringify(rows, null, 2));
}

function toPublicText(r: StoredText): ConsentTextVersion {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}
function toPublicConsent(r: StoredConsent): KvkkConsent {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

/** Bir `consentType` için TÜM versiyonlar (en yeni önce). */
export async function listConsentTextVersions(tenantId: string, consentType: string): Promise<ConsentTextVersion[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.consentTextVersion.findMany({ where: { tenantId, consentType }, orderBy: { version: "desc" } });
    return rows.map((r) => ({
      id: r.id,
      consentType: r.consentType,
      version: r.version,
      bodyText: r.bodyText,
      effectiveFrom: r.effectiveFrom.toISOString(),
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }
  const all = await loadAllText();
  return all
    .filter((r) => r.tenantId === tenantId && r.consentType === consentType)
    .sort((a, b) => b.version - a.version)
    .map(toPublicText);
}

/** `effectiveFrom <= now` olan EN YÜKSEK versiyon — "şu an geçerli metin". Yoksa undefined. */
export async function getCurrentConsentTextVersion(
  tenantId: string,
  consentType: string,
  now: Date = new Date()
): Promise<ConsentTextVersion | undefined> {
  const all = await listConsentTextVersions(tenantId, consentType);
  return all.find((v) => new Date(v.effectiveFrom) <= now);
}

export type CreateConsentTextVersionResult = { ok: true; entry: ConsentTextVersion } | { ok: false; message: string };

/** Her çağrı YENİ bir versiyon ekler (mevcut satırlar ASLA değişmez). */
export async function createConsentTextVersion(input: {
  tenantId: string;
  consentType: string;
  bodyText: string;
  effectiveFrom: string;
  createdBy: string;
}): Promise<CreateConsentTextVersionResult> {
  if (!input.bodyText.trim()) return { ok: false, message: "Metin boş olamaz." };
  const existing = await listConsentTextVersions(input.tenantId, input.consentType);
  const nextVersion = (existing[0]?.version ?? 0) + 1;
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const created = await prisma.consentTextVersion.create({
      data: {
        id: uid("consenttext"),
        tenantId: input.tenantId,
        consentType: input.consentType,
        version: nextVersion,
        bodyText: input.bodyText,
        effectiveFrom: new Date(input.effectiveFrom),
        createdBy: input.createdBy,
      },
    });
    return {
      ok: true,
      entry: {
        id: created.id,
        consentType: created.consentType,
        version: created.version,
        bodyText: created.bodyText,
        effectiveFrom: created.effectiveFrom.toISOString(),
        createdBy: created.createdBy,
        createdAt: created.createdAt.toISOString(),
      },
    };
  }

  const all = await loadAllText();
  const row: StoredText = {
    id: uid("consenttext"),
    tenantId: input.tenantId,
    consentType: input.consentType,
    version: nextVersion,
    bodyText: input.bodyText,
    effectiveFrom: input.effectiveFrom,
    createdBy: input.createdBy,
    createdAt: now,
  };
  await saveAllText([...all, row]);
  return { ok: true, entry: toPublicText(row) };
}

export type GrantKvkkConsentInput = {
  tenantId: string;
  subjectType: ConsentSubjectType;
  subjectId: string;
  consentType: string;
  textVersionId: string;
  channel: string;
  deviceInfo?: { ip?: string; userAgent?: string };
  createdBy: string;
};

/** Her çağrı YENİ bir kayıt ekler (tarihçe korunur). */
export async function grantKvkkConsent(input: GrantKvkkConsentInput): Promise<KvkkConsent> {
  const now = new Date().toISOString();
  const record: KvkkConsent = {
    id: uid("kvkk"),
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    consentType: input.consentType,
    textVersionId: input.textVersionId,
    acceptedAt: now,
    channel: input.channel,
    deviceInfo: input.deviceInfo,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.kvkkConsent.create({
      data: {
        id: record.id,
        tenantId: input.tenantId,
        subjectType: record.subjectType,
        subjectId: record.subjectId,
        consentType: record.consentType,
        textVersionId: record.textVersionId,
        acceptedAt: new Date(record.acceptedAt),
        channel: record.channel,
        deviceInfo: record.deviceInfo as object | undefined,
        createdBy: record.createdBy,
      },
    });
    return record;
  }

  const all = await loadAllConsent();
  await saveAllConsent([...all, { ...record, tenantId: input.tenantId }]);
  return record;
}

/** Salt okunur — tek bir rıza kaydını id ile getirir (withdraw'dan ÖNCE erişim kontrolü için). */
export async function getKvkkConsentById(tenantId: string, consentId: string): Promise<KvkkConsent | undefined> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.kvkkConsent.findFirst({ where: { id: consentId, tenantId } });
    if (!row) return undefined;
    return {
      id: row.id,
      subjectType: row.subjectType as ConsentSubjectType,
      subjectId: row.subjectId,
      consentType: row.consentType,
      textVersionId: row.textVersionId,
      acceptedAt: row.acceptedAt.toISOString(),
      channel: row.channel,
      withdrawnAt: row.withdrawnAt?.toISOString() ?? undefined,
      withdrawalReason: row.withdrawalReason ?? undefined,
      deviceInfo: row.deviceInfo as { ip?: string; userAgent?: string } | undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  const all = await loadAllConsent();
  const row = all.find((r) => r.id === consentId && r.tenantId === tenantId);
  return row ? toPublicConsent(row) : undefined;
}

export type WithdrawKvkkConsentResult = { ok: true; entry: KvkkConsent } | { ok: false; message: string };

/**
 * Bir onayı geri çeker — YENİ bir satır EKLEMEZ (SocialMediaConsent'in
 * aksine, çünkü burada "hangi onay geri çekildi" ilişkisi doğrudan aynı
 * satır üzerinden izlenir); mevcut satırın `withdrawnAt`ini set eder.
 */
export async function withdrawKvkkConsent(
  tenantId: string,
  consentId: string,
  input: { reason?: string }
): Promise<WithdrawKvkkConsentResult> {
  const now = new Date().toISOString();

  if (isDbMode) {
    const { prisma } = await import("./db");
    const existing = await prisma.kvkkConsent.findFirst({ where: { id: consentId, tenantId } });
    if (!existing) return { ok: false, message: "Rıza kaydı bulunamadı." };
    if (existing.withdrawnAt) return { ok: false, message: "Bu rıza zaten geri çekilmiş." };
    const updated = await prisma.kvkkConsent.update({
      where: { id: consentId },
      data: { withdrawnAt: new Date(), withdrawalReason: input.reason },
    });
    return {
      ok: true,
      entry: {
        id: updated.id,
        subjectType: updated.subjectType as ConsentSubjectType,
        subjectId: updated.subjectId,
        consentType: updated.consentType,
        textVersionId: updated.textVersionId,
        acceptedAt: updated.acceptedAt.toISOString(),
        channel: updated.channel,
        withdrawnAt: updated.withdrawnAt?.toISOString() ?? undefined,
        withdrawalReason: updated.withdrawalReason ?? undefined,
        deviceInfo: updated.deviceInfo as { ip?: string; userAgent?: string } | undefined,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }

  const all = await loadAllConsent();
  const idx = all.findIndex((r) => r.id === consentId && r.tenantId === tenantId);
  if (idx === -1) return { ok: false, message: "Rıza kaydı bulunamadı." };
  const current = all[idx]!;
  if (current.withdrawnAt) return { ok: false, message: "Bu rıza zaten geri çekilmiş." };
  const updated: StoredConsent = { ...current, withdrawnAt: now, withdrawalReason: input.reason, updatedAt: now };
  const next = [...all];
  next[idx] = updated;
  await saveAllConsent(next);
  return { ok: true, entry: toPublicConsent(updated) };
}

/** Konunun bu tür için EN GÜNCEL onayı (acceptedAt DESC) — yoksa undefined. */
export async function getLatestKvkkConsent(
  tenantId: string,
  subjectType: ConsentSubjectType,
  subjectId: string,
  consentType: string
): Promise<KvkkConsent | undefined> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.kvkkConsent.findFirst({
      where: { tenantId, subjectType, subjectId, consentType },
      orderBy: { acceptedAt: "desc" },
    });
    if (!row) return undefined;
    return {
      id: row.id,
      subjectType: row.subjectType as ConsentSubjectType,
      subjectId: row.subjectId,
      consentType: row.consentType,
      textVersionId: row.textVersionId,
      acceptedAt: row.acceptedAt.toISOString(),
      channel: row.channel,
      withdrawnAt: row.withdrawnAt?.toISOString() ?? undefined,
      withdrawalReason: row.withdrawalReason ?? undefined,
      deviceInfo: row.deviceInfo as { ip?: string; userAgent?: string } | undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  const all = await loadAllConsent();
  const rows = all
    .filter((r) => r.tenantId === tenantId && r.subjectType === subjectType && r.subjectId === subjectId && r.consentType === consentType)
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
  return rows[0] ? toPublicConsent(rows[0]) : undefined;
}

export async function listKvkkConsentHistory(
  tenantId: string,
  subjectType: ConsentSubjectType,
  subjectId: string
): Promise<KvkkConsent[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.kvkkConsent.findMany({
      where: { tenantId, subjectType, subjectId },
      orderBy: { acceptedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      subjectType: row.subjectType as ConsentSubjectType,
      subjectId: row.subjectId,
      consentType: row.consentType,
      textVersionId: row.textVersionId,
      acceptedAt: row.acceptedAt.toISOString(),
      channel: row.channel,
      withdrawnAt: row.withdrawnAt?.toISOString() ?? undefined,
      withdrawalReason: row.withdrawalReason ?? undefined,
      deviceInfo: row.deviceInfo as { ip?: string; userAgent?: string } | undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
  const all = await loadAllConsent();
  return all
    .filter((r) => r.tenantId === tenantId && r.subjectType === subjectType && r.subjectId === subjectId)
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))
    .map(toPublicConsent);
}

/**
 * Saf birleştirme mantığı — I/O yapmaz, `latestConsent`/`currentTextVersion`
 * çağıran tarafça yüklenir (test edilebilirlik + tekrar kullanım için).
 */
export function computeEffectiveConsentStatus(
  latestConsent: Pick<KvkkConsent, "withdrawnAt" | "textVersionId"> | undefined,
  currentTextVersion: Pick<ConsentTextVersion, "id"> | undefined
): ConsentEffectiveStatus {
  if (!latestConsent) return "missing";
  if (latestConsent.withdrawnAt) return "withdrawn";
  if (!currentTextVersion || latestConsent.textVersionId !== currentTextVersion.id) return "outdated";
  return "valid";
}

/** `getLatestKvkkConsent` + `getCurrentConsentTextVersion` + `computeEffectiveConsentStatus` birleşimi. */
export async function getEffectiveConsentStatus(
  tenantId: string,
  subjectType: ConsentSubjectType,
  subjectId: string,
  consentType: string,
  now: Date = new Date()
): Promise<ConsentEffectiveStatus> {
  const [latestConsent, currentTextVersion] = await Promise.all([
    getLatestKvkkConsent(tenantId, subjectType, subjectId, consentType),
    getCurrentConsentTextVersion(tenantId, consentType, now),
  ]);
  return computeEffectiveConsentStatus(latestConsent, currentTextVersion);
}

/**
 * `Student.communicationOptOut`in genellemesi — bir `feature` anahtarı
 * `consentSettings.restrictedFeatures`de VARSA VE bu konunun o özellikle
 * AYNI adı taşıyan `consentType` için geçerli ("valid") bir rızası YOKSA,
 * özellik bu konu için kısıtlıdır. Anahtar kuralı: `feature` === `consentType`
 * (ayrı bir eşleme tablosu İCAT EDİLMEDİ — kurum "whatsapp_messaging" gibi
 * bir özelliği kısıtlamak istiyorsa, o isimle bir ConsentTextVersion tanımlar).
 */
export async function isFeatureRestrictedForSubject(
  tenantId: string,
  consentSettings: ConsentSettings,
  subjectType: ConsentSubjectType,
  subjectId: string,
  feature: string,
  now: Date = new Date()
): Promise<boolean> {
  if (!consentSettings.restrictedFeatures.includes(feature)) return false;
  const status = await getEffectiveConsentStatus(tenantId, subjectType, subjectId, feature, now);
  return status !== "valid";
}

/**
 * Öğrenci listesi filtresi — bu tür için EN GÜNCEL kaydı geri çekilmemiş konu kimlikleri, TEK sorguda.
 * Öğrenci kaydında rıza veli adına (`subjectType: "parent"`, subjectId = öğrenci) alınır; portal
 * kapısında öğrencinin kendisi — ikisi de öğrenci kimliğine bağlıdır, bu yüzden ikisi de sayılır.
 */
export async function listKvkkConsentedSubjectIds(tenantId: string, consentType: string): Promise<Set<string>> {
  const rows: { subjectType: string; subjectId: string; acceptedAt: string; withdrawn: boolean }[] = [];
  if (isDbMode) {
    const { prisma } = await import("./db");
    const found = await prisma.kvkkConsent.findMany({
      where: { tenantId, consentType, subjectType: { in: ["student", "parent"] } },
      select: { subjectType: true, subjectId: true, acceptedAt: true, withdrawnAt: true },
    });
    for (const r of found) {
      rows.push({ subjectType: r.subjectType, subjectId: r.subjectId, acceptedAt: r.acceptedAt.toISOString(), withdrawn: Boolean(r.withdrawnAt) });
    }
  } else {
    for (const r of await loadAllConsent()) {
      if (r.tenantId !== tenantId || r.consentType !== consentType) continue;
      if (r.subjectType !== "student" && r.subjectType !== "parent") continue;
      rows.push({ subjectType: r.subjectType, subjectId: r.subjectId, acceptedAt: r.acceptedAt, withdrawn: Boolean(r.withdrawnAt) });
    }
  }
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.subjectType}:${r.subjectId}`;
    const prev = latest.get(key);
    if (!prev || r.acceptedAt > prev.acceptedAt) latest.set(key, r);
  }
  const ids = new Set<string>();
  for (const r of latest.values()) if (!r.withdrawn) ids.add(r.subjectId);
  return ids;
}
