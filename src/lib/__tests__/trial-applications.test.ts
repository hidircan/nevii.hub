import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { createTrialLessonTool } from "../services/tools";
import { TRIAL_LESSONS_FILE } from "../trial-lessons";
import { resolveActiveInstrumentNames } from "../instrument-catalog";
import {
  TRIAL_APPLICATIONS_FILE,
  TRIAL_SLOT_MINUTES,
  listTrialApplicationsTool,
  loadTrialSlotSuggestions,
  submitPublicTrialApplication,
  updateTrialApplicationTool,
} from "../trial-applications";
import type { ServiceContext } from "../services/context";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
const tenant = { tenantId: DEFAULT_TENANT_ID };

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await fs.rm(TRIAL_LESSONS_FILE, { force: true });
  await fs.rm(TRIAL_APPLICATIONS_FILE, { force: true });
});

async function instrumentWithSlots() {
  for (const instrument of await resolveActiveInstrumentNames(DEFAULT_TENANT_ID)) {
    const slots = await loadTrialSlotSuggestions(DEFAULT_TENANT_ID, { instrument });
    if (slots.length > 0) return { instrument, slots };
  }
  throw new Error("seed verisinde boş deneme zamanı olan enstrüman yok");
}

describe("deneme dersi başvurusu (2026-10-05)", () => {
  it("öneri → başvuru (öğretmen sunucuda eşlenir) → planla → başvuru Planlandı, o saat artık önerilmez", async () => {
    const { instrument, slots } = await instrumentWithSlots();
    expect(slots.length).toBeLessThanOrEqual(15);
    const pick = slots[0]!;
    const res = await submitPublicTrialApplication(tenant, {
      name: "Aday Deneme",
      phone: "0532 111 22 33",
      instrument,
      preferredSlots: [{ startAt: pick.startAt, branchId: pick.branchId, teacherId: "uydurma" }],
      kvkkConsent: true,
    });
    expect(res).toMatchObject({ ok: true });
    expect(res.ok && res.applicationNo).toMatch(/^BD-\d{6}$/);
    const list = await listTrialApplicationsTool(admin);
    const app = list.ok ? list.data[0]! : undefined;
    expect(app?.status).toBe("new");
    // İstemcinin gönderdiği öğretmen yok sayılır; eşleme güncel önerilerden gelir.
    expect(app?.preferredSlots[0]?.teacherId).toBe(pick.teacherId);

    // Aynı telefon + enstrüman tekrar → yeni kayıt yok.
    const again = await submitPublicTrialApplication(tenant, { name: "Aday Deneme", phone: "05321112233", instrument, availabilityNote: "akşam", kvkkConsent: true });
    // Yanıt numarasız ve genel: telefonla başkasının başvurusu sorgulanamaz; ikinci kayıt yok.
    expect(again).toEqual({ ok: true });
    const stillOne = await listTrialApplicationsTool(admin);
    expect(stillOne.ok && stillOne.data.length).toBe(1);

    // "Planlandı" elle verilemez; planlama başvuruyu bağlar.
    const manual = await updateTrialApplicationTool(admin, { id: app!.id, status: "planned" });
    expect(manual.ok).toBe(false);
    const created = await createTrialLessonTool(admin, {
      name: app!.name,
      phone: app!.phone,
      instrument,
      branchId: pick.branchId,
      teacherId: pick.teacherId,
      startAt: pick.startAt,
      durationMinutes: TRIAL_SLOT_MINUTES,
      applicationId: app!.id,
    });
    expect(created.ok).toBe(true);
    const after = await listTrialApplicationsTool(admin);
    expect(after.ok && after.data[0]).toMatchObject({ status: "planned", trialLessonId: created.ok ? created.data.trialId : "x" });
    const fresh = await loadTrialSlotSuggestions(DEFAULT_TENANT_ID, { instrument });
    expect(fresh.some((s) => s.startAt === pick.startAt && s.teacherId === pick.teacherId)).toBe(false);
  });

  it("KVKK onayı, zaman/uygunluk ve katalog dışı enstrüman reddedilir; öğretmen başvuruları göremez", async () => {
    const { instrument } = await instrumentWithSlots();
    const noKvkk = await submitPublicTrialApplication(tenant, { name: "Aday", phone: "05321112233", instrument, availabilityNote: "x" });
    expect(noKvkk).toMatchObject({ ok: false, status: 400 });
    const noTime = await submitPublicTrialApplication(tenant, { name: "Aday", phone: "05321112233", instrument, kvkkConsent: true });
    expect(!noTime.ok && noTime.message).toContain("en az bir zaman");
    const badInstrument = await submitPublicTrialApplication(tenant, { name: "Aday", phone: "05321112233", instrument: "Tuba-yok", availabilityNote: "x", kvkkConsent: true });
    expect(!badInstrument.ok && badInstrument.message).toContain("enstrüman listede yok");
    expect((await listTrialApplicationsTool({ ...admin, role: "TEACHER" })).ok).toBe(false);
  });
});
