/**
 * 2026-10-05 — Herkese açık DENEME DERSİ BAŞVURUSU. Aday /basvuru/[kurum]/deneme formunu doldurur.
 * 2026-10-06 — Sistem önerisi (öğretmen müsaitliğinden üretilen saatler) KALDIRILDI: aday 1–5 alternatif
 * tarih/saati KENDİSİ yazar (Europe/Istanbul). Bunlar tercih, rezervasyon DEĞİL; kurum arayıp kesinleştirir ve
 * Deneme Dersleri > Başvurular'dan planlar (planlama deneme kuralıyla doğrulanır). Birden fazla enstrüman seçilebilir
 * (`instruments`; eski kayıtlarda yalnız `instrument`). `note` = "Adayın eğitim geçmişi bilgisi" (eski "Bize
 * iletmek istedikleriniz" verisi aynı alanda korunur).
 * STORE_MODE=db → Prisma `TrialApplication`; json/memory → dosya (panel-notes.ts ile aynı desen).
 */
import path from "path";
import { z } from "zod";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { fail, ok, type ServiceResult } from "./services/result";
import { requireRole, type ServiceContext } from "./services/context";
import { createHash } from "crypto";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, zonedWallTimeToUtc } from "./timezone";
import { logger } from "./logger";
import { applicationInstruments } from "./trial-application-instruments";
import type { Prisma, TrialApplication as DbRow } from "@prisma/client";

export type TrialApplicationStatus = "new" | "contacted" | "planned" | "declined";
export const TRIAL_APPLICATION_STATUS_LABEL: Record<TrialApplicationStatus, string> = {
  new: "Yeni",
  contacted: "Arandı",
  planned: "Planlandı",
  declined: "Kayıt olmayacak",
};

/**
 * Adayın tercih ettiği tarih/saat (rezervasyon değil). Yeni başvurularda aday yazar; `branchId` başvurunun şubesi
 * (fark etmez ise yok). `teacherId` yalnız 2026-10-06 öncesi (sistem önerisiyle) gelen eski kayıtlarda bulunur.
 */
export type TrialPreferredSlot = { startAt: string; branchId?: string; teacherId?: string };

export type TrialApplication = {
  id: string;
  applicationNo: string;
  name: string;
  phone: string;
  email?: string;
  parentName?: string;
  age?: number;
  /** Birincil (ilk seçilen) enstrüman — eski kayıtlar ve tek enstrüman bekleyen tüketiciler için. */
  instrument: string;
  /** 2026-10-06 — seçilen tüm enstrümanlar (eski kayıtlarda yok → `applicationInstruments`). */
  instruments?: string[];
  branchId?: string;
  preferredSlots: TrialPreferredSlot[];
  availabilityNote?: string;
  note?: string;
  kvkkConsentAt: string;
  status: TrialApplicationStatus;
  staffNote?: string;
  trialLessonId?: string;
  handledByUserId?: string;
  handledAt?: string;
  source?: string;
  createdAt: string;
};

/** Deneme dersi varsayılan süresi (planlama formu ön değeri). */
export const TRIAL_SLOT_MINUTES = 20;
export const TRIAL_MAX_ALTERNATIVES = 5;

export { applicationInstruments };

// ── Depolama ────────────────────────────────────────────────────────────────

export const TRIAL_APPLICATIONS_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "trial-applications.json");
type Stored = TrialApplication & { tenantId: string };

async function loadAll(): Promise<Stored[]> {
  try {
    const fs = await import("fs/promises");
    return JSON.parse(await fs.readFile(TRIAL_APPLICATIONS_FILE, "utf8")) as Stored[];
  } catch {
    return [];
  }
}

async function saveAll(rows: Stored[]): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(path.dirname(TRIAL_APPLICATIONS_FILE), { recursive: true });
  await fs.writeFile(TRIAL_APPLICATIONS_FILE, JSON.stringify(rows, null, 2));
}

function fromDb(r: DbRow): TrialApplication {
  return {
    id: r.id,
    applicationNo: r.applicationNo,
    name: r.name,
    phone: r.phone,
    email: r.email ?? undefined,
    parentName: r.parentName ?? undefined,
    age: r.age ?? undefined,
    instrument: r.instrument,
    instruments: Array.isArray(r.instruments) ? (r.instruments as string[]).filter((x) => typeof x === "string") : undefined,
    branchId: r.branchId ?? undefined,
    preferredSlots: Array.isArray(r.preferredSlots) ? (r.preferredSlots as TrialPreferredSlot[]) : [],
    availabilityNote: r.availabilityNote ?? undefined,
    note: r.note ?? undefined,
    kvkkConsentAt: r.kvkkConsentAt.toISOString(),
    status: r.status as TrialApplicationStatus,
    staffNote: r.staffNote ?? undefined,
    trialLessonId: r.trialLessonId ?? undefined,
    handledByUserId: r.handledByUserId ?? undefined,
    handledAt: r.handledAt?.toISOString(),
    source: r.source ?? undefined,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listTrialApplications(tenantId: string): Promise<TrialApplication[]> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    return (await prisma.trialApplication.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 500 })).map(fromDb);
  }
  return (await loadAll())
    .filter((a) => a.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ tenantId: _ignored, ...a }) => a); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** false = aynı kimlikli başvuru zaten var (tekrar deneme) — ikinci kayıt yazılmadı. */
async function insertApplication(tenantId: string, a: TrialApplication): Promise<boolean> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    try {
      await prisma.trialApplication.create({
        data: {
          ...a,
          tenantId,
          instruments: a.instruments as unknown as Prisma.InputJsonValue,
          preferredSlots: a.preferredSlots as unknown as Prisma.InputJsonValue,
          kvkkConsentAt: new Date(a.kvkkConsentAt),
          handledAt: undefined,
          createdAt: new Date(a.createdAt),
        },
      });
      return true;
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") return false;
      throw e;
    }
  }
  const all = await loadAll();
  if (all.some((x) => x.id === a.id)) return false;
  await saveAll([...all, { ...a, tenantId }]);
  return true;
}

async function patchApplication(
  tenantId: string,
  id: string,
  patch: Partial<Pick<TrialApplication, "status" | "staffNote" | "trialLessonId" | "handledByUserId" | "handledAt">>
): Promise<TrialApplication | null> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    const res = await prisma.trialApplication.updateMany({
      where: { id, tenantId },
      data: { ...patch, handledAt: patch.handledAt ? new Date(patch.handledAt) : undefined },
    });
    if (res.count === 0) return null;
    return fromDb(await prisma.trialApplication.findFirstOrThrow({ where: { id, tenantId } }));
  }
  const all = await loadAll();
  const i = all.findIndex((a) => a.id === id && a.tenantId === tenantId);
  if (i < 0) return null;
  all[i] = { ...all[i]!, ...patch };
  await saveAll(all);
  const { tenantId: _ignored, ...a } = all[i]!; // eslint-disable-line @typescript-eslint/no-unused-vars
  return a;
}

// ── Herkese açık gönderim ───────────────────────────────────────────────────

const phoneDigits = (p: string) => p.replace(/\D/g, "");

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const hmRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const publicSchema = z.object({
  name: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı.").max(120, "Ad soyad en fazla 120 karakter olabilir."),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((p) => phoneDigits(p).length >= 10 && phoneDigits(p).length <= 13, "Telefon numarasını alan koduyla eksiksiz yazın (ör. 0532 123 45 67)."),
  email: z.string().trim().max(160).email("E-posta adresi geçerli görünmüyor; düzeltin ya da boş bırakın.").optional().or(z.literal("")),
  parentName: z.string().trim().max(120).optional(),
  age: z.coerce.number().int().min(3, "Yaş 3 ile 99 arasında olmalı.").max(99, "Yaş 3 ile 99 arasında olmalı.").optional().or(z.literal("")),
  /** 2026-10-06 — birden fazla enstrüman. Eski istemci uyumu: tek `instrument` da kabul edilir. */
  instruments: z.array(z.string().trim().min(1).max(80)).max(10, "En fazla 10 enstrüman seçebilirsiniz.").optional(),
  instrument: z.string().trim().max(80).optional(),
  branchId: z.string().trim().max(80).optional(),
  /** Adayın yazdığı 1–5 alternatif (İstanbul saati). */
  alternatives: z
    .array(z.object({ date: z.string().trim().max(10), time: z.string().trim().max(5) }))
    .max(TRIAL_MAX_ALTERNATIVES, `En fazla ${TRIAL_MAX_ALTERNATIVES} alternatif tarih/saat yazabilirsiniz.`)
    .default([]),
  availabilityNote: z.string().trim().max(300).optional(),
  /** "Adayın eğitim geçmişi bilgisi". */
  note: z.string().trim().max(1000).optional(),
  kvkkConsent: z.literal(true, { message: "Başvurunun alınması için aydınlatma metnini onaylamanız gerekiyor." }),
  source: z.string().trim().max(80).optional(),
  /** İstemcinin form başına ürettiği tekrar-deneme anahtarı (idempotans). */
  submissionKey: z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
});

/**
 * Saf: aday alternatiflerini doğrular ve UTC ana çevirir (Europe/Istanbul duvar saati). Geçersiz takvim günü,
 * geçmiş zaman ve aynı tarih+saatin tekrarı reddedilir.
 */
export function parseTrialAlternatives(
  raw: { date: string; time: string }[],
  now: Date
): { ok: true; slots: { startAt: string }[] } | { ok: false; message: string } {
  if (raw.length === 0) return { ok: false, message: "Size uygun en az bir tarih ve saat yazın." };
  if (raw.length > TRIAL_MAX_ALTERNATIVES) return { ok: false, message: `En fazla ${TRIAL_MAX_ALTERNATIVES} alternatif tarih/saat yazabilirsiniz.` };
  const seen = new Set<string>();
  const slots: { startAt: string }[] = [];
  for (const [i, r] of raw.entries()) {
    const n = i + 1;
    if (!ymdRe.test(r.date) || !hmRe.test(r.time)) return { ok: false, message: `${n}. alternatifin tarihini ve saatini eksiksiz seçin.` };
    const start = zonedWallTimeToUtc(r.date, r.time, DEFAULT_APP_TIMEZONE);
    if (Number.isNaN(start.getTime()) || toZonedYmd(start, DEFAULT_APP_TIMEZONE) !== r.date) {
      return { ok: false, message: `${n}. alternatifin tarihi geçerli bir takvim günü değil; tarihi düzeltin.` };
    }
    if (start.getTime() <= now.getTime()) return { ok: false, message: `${n}. alternatif geçmiş bir zaman; ileri bir tarih ve saat seçin.` };
    const key = `${r.date} ${r.time}`;
    if (seen.has(key)) return { ok: false, message: `${n}. alternatif daha önce yazdığınız bir tarih/saatle aynı; farklı bir seçenek yazın ya da satırı kaldırın.` };
    seen.add(key);
    slots.push({ startAt: start.toISOString() });
  }
  return { ok: true, slots };
}

/**
 * Yeni, mükerrer ve bot (honeypot) başvuru için BİREBİR aynı yanıt `{ ok: true }` — başvuru no herkese açık
 * yanıtta hiç dönmez; böylece telefonla başkasının başvurusu sorgulanamaz (no yalnız panelde görünür).
 */
export type PublicTrialSubmitResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

export async function submitPublicTrialApplication(
  tenant: { tenantId: string },
  input: unknown,
  now = new Date()
): Promise<PublicTrialSubmitResult> {
  const parsed = publicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "Formdaki bilgileri kontrol edin." };
  const v = parsed.data;
  const requested = Array.from(new Set([...(v.instruments ?? []), ...(v.instrument ? [v.instrument] : [])].map((x) => x.trim()).filter(Boolean)));
  if (requested.length === 0) return { ok: false, status: 400, message: "En az bir enstrüman seçin." };
  const alternatives = parseTrialAlternatives(v.alternatives, now);
  if (!alternatives.ok) return { ok: false, status: 400, message: alternatives.message };

  const { runWithTenantAsync } = await import("./tenant-context");
  return runWithTenantAsync(tenant.tenantId, async () => {
    const [{ resolveActiveInstrumentNames }, { readReferenceData }] = await Promise.all([import("./instrument-catalog"), import("./store")]);
    const active = await resolveActiveInstrumentNames(tenant.tenantId);
    const unknown = requested.filter((x) => !active.includes(x));
    if (unknown.length > 0) return { ok: false, status: 400, message: "Seçilen enstrümanlardan biri listede yok. Listeden enstrüman seçin." };
    const branches = (await readReferenceData()).settings.branches;
    if (v.branchId && !branches.some((b) => b.id === v.branchId)) return { ok: false, status: 400, message: "Seçilen şube bulunamadı. Listeden bir şube seçin." };

    // Mükerrer: aynı telefon + ortak enstrüman, açık başvuru (7 gün) → yeni kayıt/bildirim yok.
    const existing = await listTrialApplications(tenant.tenantId);
    const dup = existing.find(
      (a) =>
        phoneDigits(a.phone) === phoneDigits(v.phone) &&
        applicationInstruments(a).some((x) => requested.includes(x)) &&
        (a.status === "new" || a.status === "contacted") &&
        now.getTime() - new Date(a.createdAt).getTime() < 7 * 86_400_000
    );
    if (dup) return { ok: true };

    // Tekrar deneme (ağ kesintisi / çift tıklama): form anahtarından türetilmiş kimlik → ikinci satır yazılamaz.
    const id = v.submissionKey
      ? `tapp_${createHash("sha256").update(`${tenant.tenantId}:${v.submissionKey}`).digest("hex").slice(0, 24)}`
      : uid("tapp");
    // ponytail: başvuru no = kurumdaki sayı + 1; eşzamanlı iki başvuruda aynı no çıkabilir (yalnız görüntü).
    const app: TrialApplication = {
      id,
      applicationNo: `BD-${String(existing.length + 1).padStart(6, "0")}`,
      name: v.name,
      phone: v.phone,
      email: v.email || undefined,
      parentName: v.parentName || undefined,
      age: typeof v.age === "number" ? v.age : undefined,
      instrument: requested[0]!,
      instruments: requested,
      branchId: v.branchId || undefined,
      preferredSlots: alternatives.slots.map((x) => ({ startAt: x.startAt, ...(v.branchId ? { branchId: v.branchId } : {}) })),
      availabilityNote: v.availabilityNote || undefined,
      note: v.note || undefined,
      kvkkConsentAt: now.toISOString(),
      status: "new",
      source: v.source || undefined,
      createdAt: now.toISOString(),
    };
    const inserted = await insertApplication(tenant.tenantId, app);
    if (!inserted) return { ok: true };

    // Kayıt KALICI yazıldıktan HEMEN sonra bildirim. Hata başvuruyu kaybettirmez (liste kaynağı başvuru tablosu);
    // ama sessiz de geçmez: hedefsiz/başarısız sonuç loglanır. dedupeKey = başvuru kimliği → tekrar denemede tek bildirim.
    await notifyNewTrialApplication(tenant.tenantId, app);
    return { ok: true };
  });
}

/** Yeni başvuru bildirimi — kurumun başvuruları görmeye yetkili yöneticilerine (SCHOOL_ADMIN + SUPER_ADMIN). */
export async function notifyNewTrialApplication(tenantId: string, app: Pick<TrialApplication, "id" | "applicationNo" | "instrument" | "instruments">) {
  try {
    const { notifyAdmins } = await import("./manager-notifications");
    const outcomes = await notifyAdmins(
      tenantId,
      "trial_new_application",
      {
        // Adayın yazdığı serbest metin (ad, not) bildirime GİRMEZ: bağlantı gövdedeki yoldan çözülür (enjeksiyon yok).
        // Enstrüman adları katalogdan doğrulanmıştır.
        title: "Yeni deneme dersi başvurusu",
        body: `${app.applicationNo} — ${applicationInstruments(app).join(", ")} için yeni deneme dersi başvurusu var. Detay: /panel/deneme?sekme=basvurular`,
      },
      { dedupeKey: app.id, windowMs: 30 * 86_400_000 }
    );
    if (outcomes.length === 0) logger.warn("trial application: bildirim hedefi yok", { tenantId, applicationId: app.id });
    else if (outcomes.includes("failed")) logger.error("trial application: bildirim kısmen/tamamen başarısız", { tenantId, applicationId: app.id, outcomes });
    return outcomes;
  } catch (e) {
    logger.error("trial application: bildirim gönderilemedi", { tenantId, applicationId: app.id, error: e instanceof Error ? e.message : String(e) });
    return ["failed" as const];
  }
}

// ── Yönetici araçları ───────────────────────────────────────────────────────

/** Kurum yöneticileri (SUPER_ADMIN requireRole'da geçer). Şube müdürü yok: başvuru şubesiz olabilir (fail-closed). */
const ADMIN_ROLES = ["SCHOOL_ADMIN"] as ServiceContext["role"][];

export async function listTrialApplicationsTool(ctx: ServiceContext): Promise<ServiceResult<TrialApplication[]>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Deneme başvurularını yalnız kurum yöneticileri görebilir.");
  return ok(await listTrialApplications(ctx.tenantId));
}

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["new", "contacted", "planned", "declined"]).optional(),
  staffNote: z.string().trim().max(1000).optional(),
});

export async function updateTrialApplicationTool(ctx: ServiceContext, input: unknown): Promise<ServiceResult<TrialApplication>> {
  const auth = requireRole(ctx, ADMIN_ROLES);
  if (!auth.ok) return fail("FORBIDDEN", "Deneme başvurusunu yalnız kurum yöneticileri güncelleyebilir.");
  const v = updateSchema.safeParse(input);
  if (!v.success) return fail("VALIDATION_ERROR", "Başvuru güncellemesi okunamadı. Sayfayı yenileyip tekrar deneyin.");
  const current = (await listTrialApplications(ctx.tenantId)).find((a) => a.id === v.data.id);
  if (!current) return fail("NOT_FOUND", "Başvuru bulunamadı; silinmiş ya da başka kuruma ait olabilir. Sayfayı yenileyin.");
  if (v.data.status === "planned" && !current.trialLessonId) {
    return fail("VALIDATION_ERROR", "\"Planlandı\" durumu deneme dersi oluşturulunca kendiliğinden verilir. Başvurudaki \"Planla\" düğmesini kullanın.");
  }
  const updated = await patchApplication(ctx.tenantId, v.data.id, {
    ...(v.data.status ? { status: v.data.status } : {}),
    ...(v.data.staffNote !== undefined ? { staffNote: v.data.staffNote || undefined } : {}),
    handledByUserId: ctx.userId,
    handledAt: new Date().toISOString(),
  });
  return updated ? ok(updated) : fail("NOT_FOUND", "Başvuru bulunamadı. Sayfayı yenileyin.");
}

/** Deneme dersi bir başvurudan planlandığında (createTrialLessonTool) — başvuru "Planlandı" + deneme bağı. */
export async function markTrialApplicationPlanned(ctx: ServiceContext, applicationId: string, trialLessonId: string): Promise<void> {
  await patchApplication(ctx.tenantId, applicationId, {
    status: "planned",
    trialLessonId,
    handledByUserId: ctx.userId,
    handledAt: new Date().toISOString(),
  });
}
