/**
 * ÖNCELİK 4 (devam) — Sosyal medya izni. `SocialMediaConsent` şeması
 * (prisma/schema.prisma + src/lib/types.ts) daha önce eklenmişti ama hiçbir
 * store/tool/UI katmanı yazılmamıştı (`socialMediaConsentSchema` de
 * validation.ts'te aynı şekilde kullanılmadan duruyordu) — bu modül onu
 * ilk kez gerçek bir CRUD'a bağlar. Aynı desen `closed-day-overrides.ts`
 * ile: isDbMode ? prisma : JSON dosyası (STORE_MODE=memory de bu dosya
 * tabanlı yolu kullanır — AppData store triad'ının parçası değil, bağımsız
 * bir modül, tıpkı closed-day-overrides.ts gibi).
 *
 * Öğrenci başına TEK "güncel" kayıt YOKTUR — her izin değişikliği yeni bir
 * satır olarak eklenir (tarihçe korunur); "en güncel" kayıt
 * `getLatestSocialMediaConsent` ile `grantedAt` DESC sıralamasının ilkidir.
 */

import path from "path";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import type { SocialMediaConsent, SocialMediaConsentStatus, SocialMediaScope } from "./types";

const FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "social-media-consents.json");
export const SOCIAL_MEDIA_CONSENTS_FILE = FILE;

type Stored = SocialMediaConsent & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

async function saveAll(rows: Stored[]) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

function toPublic(r: Stored): SocialMediaConsent {
  const { tenantId: _t, ...pub } = r;
  void _t;
  return pub;
}

export type SetSocialMediaConsentInput = {
  tenantId: string;
  studentId: string;
  status: SocialMediaConsentStatus;
  representativeName: string;
  relationship: string;
  scopes: SocialMediaScope[];
  sourceDocumentRef?: string;
  /** Değiştiren kullanıcı — audit için (bkz. tools.ts setSocialMediaConsentTool). */
  actorUserId: string;
};

/** Her çağrı YENİ bir kayıt ekler — tarihçe (grantedAt/withdrawnAt + history) korunur. */
export async function setSocialMediaConsent(input: SetSocialMediaConsentInput): Promise<SocialMediaConsent> {
  const now = new Date().toISOString();
  const record: SocialMediaConsent = {
    id: uid("smc"),
    studentId: input.studentId,
    status: input.status,
    representativeName: input.representativeName,
    relationship: input.relationship,
    grantedAt: now,
    scopes: input.scopes,
    sourceDocumentRef: input.sourceDocumentRef,
    withdrawnAt: input.status === "withdrawn" ? now : undefined,
    history: [{ at: now, byUserId: input.actorUserId, action: `status:${input.status}` }],
    createdAt: now,
    updatedAt: now,
  };

  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.socialMediaConsent.create({
      data: {
        id: record.id,
        tenantId: input.tenantId,
        studentId: record.studentId,
        status: record.status,
        representativeName: record.representativeName,
        relationship: record.relationship,
        grantedAt: new Date(record.grantedAt),
        scopes: record.scopes,
        sourceDocumentRef: record.sourceDocumentRef,
        withdrawnAt: record.withdrawnAt ? new Date(record.withdrawnAt) : undefined,
        history: record.history as object,
      },
    });
    return record;
  }

  const all = await loadAll();
  await saveAll([...all, { ...record, tenantId: input.tenantId }]);
  return record;
}

/**
 * "En güncel izin kaydı" TEK sıralama kuralı (2026-09-20 kök neden düzeltmesi).
 *
 * KÖK NEDEN: sıralama yalnız `grantedAt` (ISO, milisaniye) ile yapılıyordu.
 * Aynı öğrenci için "granted" ve hemen ardından "withdrawn" kaydı AYNI
 * milisaniyede oluşabiliyor (hızlı bir istek zincirinde veya hızlı bir
 * makinede); bu durumda `localeCompare` 0 döner, sıralama kararsız kalır ve
 * ÖNCE eklenen ("granted") kayıt "en güncel" sanılır. Sonuç: geri çekilmiş
 * bir fotoğraf/video izni sistemde HÂLÂ VERİLMİŞ görünebilir — KVKK açısından
 * kabul edilemez bir hata.
 *
 * Çözüm: eşitlikte EKLENME SIRASI belirler (dosya deposunda dizi sırası, db'de
 * `createdAt` + `id`). Kayıtlar yalnız append edildiği için son eklenen her
 * zaman en günceldir.
 */
function compareConsentRecency(a: Stored, b: Stored, aIndex: number, bIndex: number): number {
  const byGranted = b.grantedAt.localeCompare(a.grantedAt);
  if (byGranted !== 0) return byGranted;
  const byCreated = (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  if (byCreated !== 0) return byCreated;
  return bIndex - aIndex; // sonradan eklenen önce
}

/** `Stored[]` → en güncelden eskiye, kararlı ve eşitlik-güvenli sıralama. */
function sortByRecency(rows: Stored[]): Stored[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => compareConsentRecency(x.row, y.row, x.index, y.index))
    .map((x) => x.row);
}

/** Öğrencinin en güncel izin kaydı — yoksa undefined (henüz hiç izin girilmemiş). */
export async function getLatestSocialMediaConsent(
  tenantId: string,
  studentId: string
): Promise<SocialMediaConsent | undefined> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const row = await prisma.socialMediaConsent.findFirst({
      where: { tenantId, studentId },
      // Eşit `grantedAt` (aynı milisaniye) durumunda kararlı tie-break — bkz. compareConsentRecency.
      orderBy: [{ grantedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    if (!row) return undefined;
    return {
      id: row.id,
      studentId: row.studentId,
      status: row.status as SocialMediaConsentStatus,
      representativeName: row.representativeName,
      relationship: row.relationship,
      grantedAt: row.grantedAt.toISOString(),
      scopes: row.scopes as SocialMediaScope[],
      sourceDocumentRef: row.sourceDocumentRef ?? undefined,
      withdrawnAt: row.withdrawnAt?.toISOString() ?? undefined,
      history: row.history as unknown as SocialMediaConsent["history"],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  const all = await loadAll();
  const rows = sortByRecency(all.filter((r) => r.tenantId === tenantId && r.studentId === studentId));
  return rows[0] ? toPublic(rows[0]) : undefined;
}

export async function listSocialMediaConsentHistory(
  tenantId: string,
  studentId: string
): Promise<SocialMediaConsent[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const rows = await prisma.socialMediaConsent.findMany({
      where: { tenantId, studentId },
      orderBy: [{ grantedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      status: row.status as SocialMediaConsentStatus,
      representativeName: row.representativeName,
      relationship: row.relationship,
      grantedAt: row.grantedAt.toISOString(),
      scopes: row.scopes as SocialMediaScope[],
      sourceDocumentRef: row.sourceDocumentRef ?? undefined,
      withdrawnAt: row.withdrawnAt?.toISOString() ?? undefined,
      history: row.history as unknown as SocialMediaConsent["history"],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
  const all = await loadAll();
  return sortByRecency(all.filter((r) => r.tenantId === tenantId && r.studentId === studentId)).map(toPublic);
}
