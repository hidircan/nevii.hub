/**
 * 2026-10-05 — Herkese açık DENEME DERSİ BAŞVURUSU. Aday /basvuru/[kurum]/deneme formunu doldurur; uygun
 * zaman seçenekleri öğretmen müsaitliği + mevcut ders/deneme çakışmalarından, deneme dersi planlamasının
 * KENDİ kuralıyla (`validateTrialSlot`) üretilir. Seçim rezervasyon DEĞİL, tercihtir: yönetici arar,
 * Deneme Dersleri > Başvurular'dan planlar (planlama yine aynı kuralla doğrulanır).
 * STORE_MODE=db → Prisma `TrialApplication`; json/memory → dosya (panel-notes.ts ile aynı desen).
 */
import path from "path";
import { z } from "zod";
import { isDbMode, resolveDataDir } from "./config";
import { uid } from "./utils";
import { fail, ok, type ServiceResult } from "./services/result";
import { requireRole, type ServiceContext } from "./services/context";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, zonedWallTimeToUtc, zonedWeekday } from "./timezone";
import { availabilityForBranch, isTeacherSchedulable, teacherServesBranch } from "./teacher-branches";
import type { AppData } from "./types";
import type { Prisma, TrialApplication as DbRow } from "@prisma/client";

export type TrialApplicationStatus = "new" | "contacted" | "planned" | "declined";
export const TRIAL_APPLICATION_STATUS_LABEL: Record<TrialApplicationStatus, string> = {
  new: "Yeni",
  contacted: "Arandı",
  planned: "Planlandı",
  declined: "Kayıt olmayacak",
};

/** Adayın seçtiği zaman. `teacherId` sunucuda eşlenir (istemciden alınmaz); yoksa zaman artık boş değildir. */
export type TrialPreferredSlot = { startAt: string; branchId: string; teacherId?: string };

export type TrialApplication = {
  id: string;
  applicationNo: string;
  name: string;
  phone: string;
  email?: string;
  parentName?: string;
  age?: number;
  instrument: string;
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

/** Deneme dersi önerilen süresi (10/15/20 kuralının üst sınırı) ve öneri ufku. */
export const TRIAL_SLOT_MINUTES = 20;
const HORIZON_DAYS = 14;
const STEP_MINUTES = 30;
const PER_DAY = 3;
const MAX_SLOTS = 15;

function addMinutesHm(hm: string, minutes: number): string {
  const [h, m] = hm.split(":").map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Saf: önümüzdeki 14 günde (yarından itibaren) bu enstrüman için boş deneme zamanları. Aynı saat+şubede
 * birden fazla öğretmen boşsa tek seçenek (ilk öğretmen). Gün başına en fazla 3 (sabah/orta/akşam), toplam 15.
 * ponytail: 30 dk adımlı tarama — öğretmen×gün×pencere başına O(n) doğrulama; kurum büyürse indeks.
 */
export function suggestTrialSlots(
  data: Pick<AppData, "teachers" | "lessons" | "settings" | "closedDayOverrides">,
  trials: Array<{ id: string; teacherId: string; startAt: string; endAt: string; status: string }>,
  input: { instrument: string; branchId?: string; now: Date },
  validate: (typeof import("./makeup-engine"))["validateTrialSlot"]
): TrialPreferredSlot[] {
  const teachers = data.teachers.filter((t) => isTeacherSchedulable(t, input.now) && t.instruments.includes(input.instrument as never));
  const out: TrialPreferredSlot[] = [];
  for (let d = 1; d <= HORIZON_DAYS && out.length < MAX_SLOTS; d++) {
    const ymd = toZonedYmd(new Date(input.now.getTime() + d * 86_400_000), DEFAULT_APP_TIMEZONE);
    const dow = zonedWeekday(zonedWallTimeToUtc(ymd, "12:00"));
    const day = new Map<string, TrialPreferredSlot>();
    for (const t of teachers) {
      const branches = input.branchId ? [input.branchId] : Array.from(new Set([t.branchId, ...(t.branchIds ?? [])]));
      for (const branchId of branches) {
        if (!teacherServesBranch(t, branchId)) continue;
        for (const w of availabilityForBranch(t.availability, branchId).filter((a) => a.dayOfWeek === dow)) {
          for (let hm = w.start; addMinutesHm(hm, TRIAL_SLOT_MINUTES) <= w.end; hm = addMinutesHm(hm, STEP_MINUTES)) {
            const startAt = zonedWallTimeToUtc(ymd, hm).toISOString();
            const key = `${startAt}|${branchId}`;
            if (day.has(key)) continue;
            const v = validate(data, { teacherId: t.id, branchId, instrument: input.instrument, startAt, durationMinutes: TRIAL_SLOT_MINUTES }, trials);
            if (v.ok) day.set(key, { startAt, branchId, teacherId: t.id });
          }
        }
      }
    }
    // Günün en erken, ortası ve en geç boş saati — okul/iş çıkışı gelecek adaylara da seçenek kalsın.
    const sorted = [...day.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const picks = sorted.length <= PER_DAY ? sorted : [sorted[0]!, sorted[Math.floor((sorted.length - 1) / 2)]!, sorted[sorted.length - 1]!];
    out.push(...picks);
  }
  return out.slice(0, MAX_SLOTS);
}

/** Kurum kapsamında (ALS kurulmuş) güncel boş zamanlar — public form ve sunucu tarafı eşleme bunu kullanır. */
export async function loadTrialSlotSuggestions(
  tenantId: string,
  input: { instrument: string; branchId?: string },
  now = new Date()
): Promise<TrialPreferredSlot[]> {
  const [{ readLessonWindow }, { listTrialLessons }, { validateTrialSlot }] = await Promise.all([
    import("./store"),
    import("./trial-lessons"),
    import("./makeup-engine"),
  ]);
  const data = await readLessonWindow(now.toISOString(), new Date(now.getTime() + (HORIZON_DAYS + 1) * 86_400_000).toISOString());
  const trials = (await listTrialLessons(tenantId)).filter((t) => new Date(t.endAt) >= now);
  return suggestTrialSlots(data, trials, { ...input, now }, validateTrialSlot);
}

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

async function insertApplication(tenantId: string, a: TrialApplication): Promise<void> {
  if (isDbMode) {
    const { prisma } = await import("./db");
    await prisma.trialApplication.create({
      data: {
        ...a,
        tenantId,
        preferredSlots: a.preferredSlots as unknown as Prisma.InputJsonValue,
        kvkkConsentAt: new Date(a.kvkkConsentAt),
        handledAt: undefined,
        createdAt: new Date(a.createdAt),
      },
    });
    return;
  }
  await saveAll([...(await loadAll()), { ...a, tenantId }]);
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
  instrument: z.string().trim().min(1, "Enstrüman seçin."),
  branchId: z.string().trim().max(80).optional(),
  preferredSlots: z.array(z.object({ startAt: z.string().max(40), branchId: z.string().max(80) })).max(3, "En fazla 3 zaman seçebilirsiniz.").default([]),
  availabilityNote: z.string().trim().max(300).optional(),
  note: z.string().trim().max(1000).optional(),
  kvkkConsent: z.literal(true, { message: "Başvurunun alınması için aydınlatma metnini onaylamanız gerekiyor." }),
  source: z.string().trim().max(80).optional(),
});

/** Mükerrer başvuruda da AYNI genel yanıt (no yok): telefonla başkasının başvurusu sorgulanamaz. */
export type PublicTrialSubmitResult =
  | { ok: true; applicationNo?: string }
  | { ok: false; status: number; message: string };

export async function submitPublicTrialApplication(
  tenant: { tenantId: string },
  input: unknown,
  now = new Date()
): Promise<PublicTrialSubmitResult> {
  const parsed = publicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "Formdaki bilgileri kontrol edin." };
  const v = parsed.data;
  const { runWithTenantAsync } = await import("./tenant-context");
  return runWithTenantAsync(tenant.tenantId, async () => {
    const [{ resolveActiveInstrumentNames }, { readReferenceData }] = await Promise.all([import("./instrument-catalog"), import("./store")]);
    const instruments = await resolveActiveInstrumentNames(tenant.tenantId);
    if (!instruments.includes(v.instrument)) return { ok: false, status: 400, message: "Seçilen enstrüman listede yok. Listeden bir enstrüman seçin." };
    const branches = (await readReferenceData()).settings.branches;
    if (v.branchId && !branches.some((b) => b.id === v.branchId)) return { ok: false, status: 400, message: "Seçilen şube bulunamadı. Listeden bir şube seçin." };

    // Mükerrer: aynı telefon + enstrüman, açık başvuru (7 gün) → yeni kayıt/bildirim yok.
    const existing = await listTrialApplications(tenant.tenantId);
    const dup = existing.find(
      (a) =>
        phoneDigits(a.phone) === phoneDigits(v.phone) &&
        a.instrument === v.instrument &&
        (a.status === "new" || a.status === "contacted") &&
        now.getTime() - new Date(a.createdAt).getTime() < 7 * 86_400_000
    );
    if (dup) return { ok: true };

    // Seçilen zamanlar SUNUCUDA güncel önerilerle eşlenir (öğretmen istemciden alınmaz; dolmuşsa tercih olarak kalır).
    const fresh = v.preferredSlots.length ? await loadTrialSlotSuggestions(tenant.tenantId, { instrument: v.instrument, branchId: v.branchId || undefined }, now) : [];
    const preferredSlots: TrialPreferredSlot[] = v.preferredSlots
      .filter((s) => !Number.isNaN(Date.parse(s.startAt)) && Date.parse(s.startAt) > now.getTime() && branches.some((b) => b.id === s.branchId))
      .map((s) => {
        const match = fresh.find((f) => f.startAt === new Date(s.startAt).toISOString() && f.branchId === s.branchId);
        return { startAt: new Date(s.startAt).toISOString(), branchId: s.branchId, ...(match?.teacherId ? { teacherId: match.teacherId } : {}) };
      });
    if (preferredSlots.length === 0 && !v.availabilityNote) {
      return { ok: false, status: 400, message: "Size uygun en az bir zaman seçin ya da uygun olduğunuz zamanları kısaca yazın." };
    }

    // ponytail: başvuru no = kurumdaki sayı + 1; eşzamanlı iki başvuruda aynı no çıkabilir (yalnız görüntü).
    const app: TrialApplication = {
      id: uid("tapp"),
      applicationNo: `BD-${String(existing.length + 1).padStart(6, "0")}`,
      name: v.name,
      phone: v.phone,
      email: v.email || undefined,
      parentName: v.parentName || undefined,
      age: typeof v.age === "number" ? v.age : undefined,
      instrument: v.instrument,
      branchId: v.branchId || undefined,
      preferredSlots,
      availabilityNote: v.availabilityNote || undefined,
      note: v.note || undefined,
      kvkkConsentAt: now.toISOString(),
      status: "new",
      source: v.source || undefined,
      createdAt: now.toISOString(),
    };
    await insertApplication(tenant.tenantId, app);

    try {
      const { notifyAdmins } = await import("./manager-notifications");
      await notifyAdmins(
        tenant.tenantId,
        "trial_new_application",
        {
          // Adayın yazdığı metin (ad, not) bildirime GİRMEZ: bağlantı gövdedeki yoldan çözülür (enjeksiyon yok).
          title: "Yeni deneme dersi başvurusu",
          body: `${app.applicationNo} — ${app.instrument} için yeni deneme dersi başvurusu var. Detay: /panel/deneme?sekme=basvurular`,
        },
        { dedupeKey: app.id }
      );
    } catch {
      // Bildirim hatası başvuruyu kaybettirmez; başvuru listede görünür.
    }
    return { ok: true, applicationNo: app.applicationNo };
  });
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
