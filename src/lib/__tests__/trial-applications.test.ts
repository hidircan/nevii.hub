/**
 * Deneme dersi başvurusu — 2026-10-06: aday 1–5 alternatifi kendisi yazar (İstanbul saati, sistem önerisi yok),
 * birden fazla enstrüman, eski tek-enstrüman uyumu, yetkili yöneticilere bildirim, tekrar denemede tek kayıt +
 * tek bildirim, planlama başvuruyu bağlar.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { createTrialLessonTool } from "../services/tools";
import { TRIAL_LESSONS_FILE } from "../trial-lessons";
import { resolveActiveInstrumentNames } from "../instrument-catalog";
import { listAllNotifications, NOTIFICATIONS_FILE } from "../notifications";
import { listAdminUserIdsForTenant } from "../auth/users";
import {
  TRIAL_APPLICATIONS_FILE,
  TRIAL_SLOT_MINUTES,
  applicationInstruments,
  listTrialApplicationsTool,
  parseTrialAlternatives,
  submitPublicTrialApplication,
  updateTrialApplicationTool,
} from "../trial-applications";
import type { ServiceContext } from "../services/context";

vi.mock("../audit/log", () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const DATA_FILE = path.join(
  resolveDataDir(path.join(process.cwd(), "data")),
  "store.json",
);
const admin: ServiceContext = {
  role: "SCHOOL_ADMIN",
  userId: "u1",
  tenantId: DEFAULT_TENANT_ID,
  channel: "web",
};
const tenant = { tenantId: DEFAULT_TENANT_ID };
const NOW = new Date("2030-01-10T09:00:00.000Z"); // İstanbul 12:00

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TRIAL_LESSONS_FILE, { force: true });
  await fs.rm(TRIAL_APPLICATIONS_FILE, { force: true });
  await fs.rm(NOTIFICATIONS_FILE, { force: true });
});

const alt = (date: string, time: string) => ({ date, time });
const trialNotifications = async () =>
  (await listAllNotifications(DEFAULT_TENANT_ID)).filter(
    (n) => n.kind === "trial_new_application",
  );

describe("alternatif tarih/saat doğrulaması (İstanbul)", () => {
  it("İstanbul duvar saati UTC'ye çevrilir; 1–5 sınırı, tekrar, geçmiş ve geçersiz gün reddedilir", () => {
    const okRes = parseTrialAlternatives(
      [alt("2030-01-15", "10:00"), alt("2030-01-16", "18:30")],
      NOW,
    );
    expect(okRes).toEqual({
      ok: true,
      slots: [
        { startAt: "2030-01-15T07:00:00.000Z" },
        { startAt: "2030-01-16T15:30:00.000Z" },
      ],
    });
    expect(parseTrialAlternatives([], NOW).ok).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) =>
      alt(`2030-01-${String(20 + i)}`, "10:00"),
    );
    expect(parseTrialAlternatives(six, NOW).ok).toBe(false);
    const dup = parseTrialAlternatives(
      [alt("2030-01-15", "10:00"), alt("2030-01-15", "10:00")],
      NOW,
    );
    expect(!dup.ok && dup.message).toContain("aynı");
    const past = parseTrialAlternatives([alt("2030-01-10", "11:59")], NOW); // İstanbul 11:59 < 12:00
    expect(!past.ok && past.message).toContain("geçmiş");
    const invalid = parseTrialAlternatives([alt("2030-02-30", "10:00")], NOW);
    expect(!invalid.ok && invalid.message).toContain("takvim günü");
    expect(parseTrialAlternatives([alt("2030-01-15", "25:00")], NOW).ok).toBe(
      false,
    );
  });
});

describe("deneme dersi başvurusu", () => {
  it("5 alternatif + 2 enstrüman kaydedilir; yöneticilere TEK bildirim; aynı anahtarla tekrar → ikinci kayıt/bildirim yok", async () => {
    const [i1, i2] = await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
    const payload = {
      name: "Aday Deneme",
      phone: "0532 111 22 33",
      instruments: [i1, i2],
      alternatives: [
        alt("2030-01-15", "10:00"),
        alt("2030-01-15", "11:00"),
        alt("2030-01-16", "17:00"),
        alt("2030-01-17", "09:30"),
        alt("2030-01-18", "19:45"),
      ],
      note: "1 yıl piyano dersi aldı",
      kvkkConsent: true,
      submissionKey: "form-key-12345678",
    };
    expect(await submitPublicTrialApplication(tenant, payload, NOW)).toEqual({
      ok: true,
    });
    const list = await listTrialApplicationsTool(admin);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.data).toHaveLength(1);
    const app = list.data[0]!;
    expect(applicationInstruments(app)).toEqual([i1, i2]);
    expect(app.instrument).toBe(i1); // eski tüketiciler için birincil
    expect(app.preferredSlots.map((s) => s.startAt)).toEqual([
      "2030-01-15T07:00:00.000Z",
      "2030-01-15T08:00:00.000Z",
      "2030-01-16T14:00:00.000Z",
      "2030-01-17T06:30:00.000Z",
      "2030-01-18T16:45:00.000Z",
    ]);
    expect(app.preferredSlots.every((s) => !s.teacherId)).toBe(true); // sistem eşlemesi/rezervasyon yok
    expect(app.note).toBe("1 yıl piyano dersi aldı");

    const admins = await listAdminUserIdsForTenant(DEFAULT_TENANT_ID);
    expect(admins.length).toBeGreaterThan(0);
    const notes = await trialNotifications();
    expect(new Set(notes.map((n) => n.targetUserId))).toEqual(new Set(admins));
    expect(notes).toHaveLength(admins.length);
    expect(notes[0]!.body).not.toContain("Aday Deneme"); // adayın serbest metni bildirime girmez
    expect(notes[0]!.body).toContain("/panel/deneme?sekme=basvurular");

    // Ağ kesintisi sonrası aynı form tekrar gönderilir (telefon farklı yazılmış olsa bile anahtar aynı).
    expect(
      await submitPublicTrialApplication(
        tenant,
        { ...payload, phone: "05321112233" },
        NOW,
      ),
    ).toEqual({ ok: true });
    // Aynı telefon + ortak enstrüman, farklı anahtar → mükerrer.
    expect(
      await submitPublicTrialApplication(
        tenant,
        { ...payload, instruments: [i2], submissionKey: "other-key-1234567" },
        NOW,
      ),
    ).toEqual({ ok: true });
    const after = await listTrialApplicationsTool(admin);
    expect(after.ok && after.data.length).toBe(1);
    expect(await trialNotifications()).toHaveLength(admins.length);
  });

  it("eski istemci (tek `instrument`) kabul edilir; katalog dışı / boş enstrüman, KVKK'sız ve zamansız başvuru reddedilir", async () => {
    const [i1] = await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
    const base = {
      name: "Aday",
      phone: "05321112299",
      alternatives: [alt("2030-01-15", "10:00")],
      kvkkConsent: true,
    };
    expect(
      await submitPublicTrialApplication(
        tenant,
        { ...base, instrument: i1 },
        NOW,
      ),
    ).toEqual({ ok: true });
    const bad = await submitPublicTrialApplication(
      tenant,
      { ...base, phone: "05320000000", instruments: [i1, "Tuba-yok"] },
      NOW,
    );
    expect(!bad.ok && bad.message).toContain("listede yok");
    const none = await submitPublicTrialApplication(
      tenant,
      { ...base, phone: "05320000001", instruments: [] },
      NOW,
    );
    expect(!none.ok && none.message).toContain("enstrüman");
    const noKvkk = await submitPublicTrialApplication(
      tenant,
      {
        ...base,
        phone: "05320000002",
        instruments: [i1],
        kvkkConsent: undefined,
      },
      NOW,
    );
    expect(noKvkk).toMatchObject({ ok: false, status: 400 });
    const noTime = await submitPublicTrialApplication(
      tenant,
      { ...base, phone: "05320000003", instruments: [i1], alternatives: [] },
      NOW,
    );
    expect(!noTime.ok && noTime.message).toContain("en az bir");
    expect(
      (await listTrialApplicationsTool({ ...admin, role: "TEACHER" })).ok,
    ).toBe(false);
  });

  it("planlama başvuruyu bağlar: 'Planlandı' elle verilemez, deneme dersi oluşunca kendiliğinden", async () => {
    const { readData } = await import("../store");
    const { writeData } = await import("../store-json");
    const { zonedWallTimeToUtc, addDaysYmd, toZonedYmd } =
      await import("../timezone");
    const active = await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
    const data = await readData();
    const teacher = data.teachers.find(
      (t) => t.active && t.instruments.some((x) => active.includes(x)),
    )!;
    const instrument = teacher.instruments.find((x) => active.includes(x))!;
    // Deterministik boş saat: öğretmenin dersleri temizlenir, her gün 09–21 müsait.
    await writeData({
      ...data,
      teachers: data.teachers.map((t) =>
        t.id === teacher.id
          ? {
              ...t,
              availability: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
                dayOfWeek: d,
                start: "09:00",
                end: "21:00",
              })),
              maxDailyLessons: 20,
            }
          : t,
      ),
      lessons: data.lessons.filter((l) => l.teacherId !== teacher.id),
    });
    let ymd = addDaysYmd(toZonedYmd(new Date(), "Europe/Istanbul"), 20);
    while (new Date(`${ymd}T12:00:00Z`).getUTCDay() !== 3)
      ymd = addDaysYmd(ymd, 1); // Çarşamba
    const sub = await submitPublicTrialApplication(tenant, {
      name: "Aday Plan",
      phone: "05321112244",
      instruments: [instrument],
      alternatives: [alt(ymd, "10:00")],
      kvkkConsent: true,
    });
    expect(sub).toEqual({ ok: true });
    const list = await listTrialApplicationsTool(admin);
    const app = list.ok ? list.data[0]! : undefined;
    expect(app?.status).toBe("new");
    expect(
      (
        await updateTrialApplicationTool(admin, {
          id: app!.id,
          status: "planned",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await updateTrialApplicationTool(admin, {
          id: app!.id,
          status: "contacted",
          staffNote: "Salı arandı",
        })
      ).ok,
    ).toBe(true);
    // Yönetici adayın tercihini ya da onayladığı başka bir saati planlar (resmî tatil denk gelirse sonraki hafta).
    let created = await createTrialLessonTool(admin, {
      name: app!.name,
      phone: app!.phone,
      instrument,
      branchId: teacher.branchId,
      teacherId: teacher.id,
      startAt: zonedWallTimeToUtc(ymd, "10:00").toISOString(),
      durationMinutes: TRIAL_SLOT_MINUTES,
      applicationId: app!.id,
    });
    for (let w = 1; w <= 6 && !created.ok; w++) {
      created = await createTrialLessonTool(admin, {
        name: app!.name,
        phone: app!.phone,
        instrument,
        branchId: teacher.branchId,
        teacherId: teacher.id,
        startAt: zonedWallTimeToUtc(
          addDaysYmd(ymd, 7 * w),
          "10:00",
        ).toISOString(),
        durationMinutes: TRIAL_SLOT_MINUTES,
        applicationId: app!.id,
      });
    }
    expect(created.ok ? "ok" : created.error.message).toBe("ok");
    if (!created.ok) return;
    const after = await listTrialApplicationsTool(admin);
    expect(after.ok && after.data[0]).toMatchObject({
      status: "planned",
      trialLessonId: created.data.trialId,
    });
  });
});
