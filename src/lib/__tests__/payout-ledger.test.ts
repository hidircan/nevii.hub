/**
 * 2026-09-30 — hakediş defteri kritik akışları (json STORE_MODE, tohum veri t1/s1/r1):
 * kısmi ödeme + bakiye, çift ödeme, ters kayıt, iptal/yeniden oluşturma, ödemeli kayıtta
 * politika farkı (kilit yok, yeniden yazma yok), hariç tutma, ücret kuralı sil/devre dışı, sürüm çakışması.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  addTeacherPayoutAdjustmentTool,
  addTeacherPayoutPaymentTool,
  cancelTeacherPayoutTool,
  computeTeacherPayoutTool,
  createTeacherPayoutTool,
  previewFeeRuleRemovalTool,
  removeFeeRuleTool,
  reverseTeacherPayoutPaymentTool,
  setLessonPayoutExclusionTool,
  setTeacherPayoutPolicyTool,
  settleTeacherPayoutDriftTool,
} from "../services/tools";
import { readData, replaceTeacherPayout } from "../store";
import { writeData } from "../store-json";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { Lesson } from "../types";
import { payoutBalance, payoutNetAmount, payoutPaidAmount } from "../payout-ledger";
import { CRITICAL_ACTION_PASSWORD_FILE } from "../critical-action-password";
import { setupCriticalPassword, TEST_CRITICAL_PASSWORD } from "./contract-cancel-test-helper";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

function lesson(id: string, start: string, minutes: number): Lesson {
  const s = new Date(start);
  return {
    id,
    studentId: "s1",
    teacherId: "t1",
    roomId: "r1",
    branchId: "erzene",
    instrument: "Piyano",
    startAt: s.toISOString(),
    endAt: new Date(s.getTime() + minutes * 60_000).toISOString(),
    type: "regular",
    status: "completed",
    lessonProcessed: true,
  } as Lesson;
}

/** Nov 2026: iki işlenmiş ders (40 + 30 dk), t1 için 10 TL/dk kural → 700 TL. */
async function seedNovember() {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  const data = await readData();
  await writeData({
    ...data,
    lessons: [...data.lessons.filter((l) => l.teacherId !== "t1"), lesson("n1", "2026-11-03T10:00:00Z", 40), lesson("n2", "2026-11-10T10:00:00Z", 30)],
    teacherFeeRules: [{ id: "fee-t1", teacherId: "t1", perMinuteRate: 10, effectiveFrom: "2020-01-01", createdAt: "2020-01-01" }],
    teacherPayouts: [],
  });
  const created = await createTeacherPayoutTool(admin, { teacherId: "t1", periodStart: "2026-11-01", periodEnd: "2026-11-30" });
  if (!created.ok) throw new Error(created.error.message);
  return created.data.payout.id;
}

const payoutOf = async (id: string) => (await readData()).teacherPayouts.find((p) => p.id === id)!;

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(CRITICAL_ACTION_PASSWORD_FILE, { force: true });
});

describe("ödeme defteri", () => {
  it("kısmi ödeme → kısmi; bakiyeyi aşan ödeme reddedilir; kalan ödenince ödendi", async () => {
    const id = await seedNovember();
    expect(payoutNetAmount(await payoutOf(id))).toBe(700);
    expect((await addTeacherPayoutPaymentTool(admin, { payoutId: id, amount: 300 })).ok).toBe(true);
    expect((await payoutOf(id)).status).toBe("partial");
    const over = await addTeacherPayoutPaymentTool(admin, { payoutId: id, amount: 500 });
    expect(over.ok).toBe(false);
    expect((await addTeacherPayoutPaymentTool(admin, { payoutId: id })).ok).toBe(true); // kalan 400
    const p = await payoutOf(id);
    expect(p.status).toBe("paid");
    expect(payoutPaidAmount(p)).toBe(700);
    expect(payoutBalance(p)).toBe(0);
  });

  it("ödeme silinmez: ters kayıt kritik şifre ister, satır izde kalır", async () => {
    const id = await seedNovember();
    await addTeacherPayoutPaymentTool(admin, { payoutId: id });
    const paymentId = (await payoutOf(id)).payments![0].id;
    const noPass = await reverseTeacherPayoutPaymentTool(admin, { payoutId: id, paymentId, reason: "Yanlış girildi", criticalPassword: "yanlis" });
    expect(noPass.ok).toBe(false);
    expect(payoutPaidAmount(await payoutOf(id))).toBe(700);
  });

  it("eşzamanlı yazma: eski sürümle yazma reddedilir (çift ödeme/düzeltme koruması)", async () => {
    const id = await seedNovember();
    const stale = await payoutOf(id);
    await addTeacherPayoutPaymentTool(admin, { payoutId: id, amount: 100 });
    await expect(replaceTeacherPayout({ ...stale, totalAmount: 1 })).rejects.toThrow("STALE_PAYOUT");
  });
});

describe("iptal / yeniden oluşturma", () => {
  it("ödemesiz kayıt iptal edilir; aynı dönem yeniden oluşturulur (aynı kayıt)", async () => {
    const id = await seedNovember();
    expect((await cancelTeacherPayoutTool(admin, { payoutId: id, reason: "Test verisiyle oluştu" })).ok).toBe(true);
    const preview = await computeTeacherPayoutTool(admin, { teacherId: "t1", periodStart: "2026-11-01", periodEnd: "2026-11-30" });
    expect(preview.ok && preview.data.existingPayout).toBeNull();
    expect(preview.ok && preview.data.cancelledPayout?.id).toBe(id);
    const again = await createTeacherPayoutTool(admin, { teacherId: "t1", periodStart: "2026-11-01", periodEnd: "2026-11-30" });
    expect(again.ok && again.data.payout.id).toBe(id);
    expect((await payoutOf(id)).status).toBe("pending");
  });

  it("ödemesi olan kayıt iptal edilemez", async () => {
    const id = await seedNovember();
    await addTeacherPayoutPaymentTool(admin, { payoutId: id, amount: 100 });
    expect((await cancelTeacherPayoutTool(admin, { payoutId: id, reason: "Denemek için" })).ok).toBe(false);
  });

  it("kesişen farklı aralıklı aktif kayıt oluşturulmaz (çift hakediş)", async () => {
    await seedNovember();
    const overlap = await createTeacherPayoutTool(admin, { teacherId: "t1", periodStart: "2026-11-15", periodEnd: "2026-12-15" });
    expect(overlap.ok).toBe(false);
  });
});

describe("politika değişikliği — kilit yok, ödenmiş kayıt yeniden yazılmaz", () => {
  it("iptal edilmiş/ödemeli kayıt politikayı kilitlemez; ödemeli kayıt değişmez, fark düzeltmeyle kapanır", async () => {
    const id = await seedNovember();
    await addTeacherPayoutPaymentTool(admin, { payoutId: id }); // 700 ödendi
    const res = await setTeacherPayoutPolicyTool(admin, { month: "2026-11", policy: "fixed_duration", rate30: 300, rate40: 400, rate50: 500 });
    expect(res.ok).toBe(true);
    const p = await payoutOf(id);
    expect(p.totalAmount).toBe(700); // ödenmiş kayıt sessizce değişmedi
    const preview = await computeTeacherPayoutTool(admin, { teacherId: "t1", periodStart: "2026-11-01", periodEnd: "2026-11-30" });
    expect(preview.ok && preview.data.existingPayout?.drift).toBe(0); // 300 + 400 = 700 → fark yok

    const res2 = await setTeacherPayoutPolicyTool(admin, { month: "2026-11", policy: "fixed_duration", rate30: 300, rate40: 500, rate50: 500 });
    expect(res2.ok && res2.data.needsAdjustment?.[0]?.drift).toBe(100);
    const noPass = await settleTeacherPayoutDriftTool(admin, { payoutId: id, reason: "Politika farkı" });
    expect(noPass.ok).toBe(false); // ödemeli kayıtta kritik şifre
    expect(payoutNetAmount(await payoutOf(id))).toBe(700);
  });
});

describe("hariç tutma ve düzeltme", () => {
  it("hariç tutulan ders ödemesiz kayıttan çıkar; ders kaydı değişmez; geri alınabilir", async () => {
    const id = await seedNovember();
    const ex = await setLessonPayoutExclusionTool(admin, { lessonId: "n2", exclude: true, reason: "Test verisi dersi" });
    expect(ex.ok && ex.data.recalculated).toBe(1);
    expect((await payoutOf(id)).totalAmount).toBe(400);
    const l = (await readData()).lessons.find((x) => x.id === "n2")!;
    expect(l.lessonProcessed).toBe(true);
    expect(l.status).toBe("completed");
    await setLessonPayoutExclusionTool(admin, { lessonId: "n2", exclude: false, reason: "Yanlışlıkla çıkarıldı" });
    expect((await payoutOf(id)).totalAmount).toBe(700);
  });

  it("ödemesiz kayıtta düzeltme şifresiz eklenir ve net değişir", async () => {
    const id = await seedNovember();
    expect((await addTeacherPayoutAdjustmentTool(admin, { payoutId: id, amount: -50, reason: "Geç kalma kesintisi" })).ok).toBe(true);
    expect(payoutNetAmount(await payoutOf(id))).toBe(650);
  });

  it("pending kayıt 'güncel hesaba eşitle' ile yeniden hesaplanır", async () => {
    const id = await seedNovember();
    const data = await readData();
    await writeData({ ...data, lessons: [...data.lessons, lesson("n3", "2026-11-20T10:00:00Z", 30)] });
    const r = await settleTeacherPayoutDriftTool(admin, { payoutId: id, reason: "Yeni ders işlendi" });
    expect(r.ok && r.data.mode).toBe("recalculated");
    expect((await payoutOf(id)).totalAmount).toBe(1000);
  });
});

describe("ücret kuralı kaldırma", () => {
  it("önizleme etkiyi sayar; onaysız silme reddedilir", async () => {
    await seedNovember();
    const preview = await previewFeeRuleRemovalTool(admin, { ruleId: "fee-t1", mode: "delete" });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    // Kasım dersleri bekleyen kayda geçti → açık ders yok; bekleyen kayıt canlıda kuralı kullanıyor.
    expect(preview.data.openLessons.total).toBe(0);
    expect(preview.data.pendingRecomputed).toHaveLength(1);
    expect(preview.data.pendingRecomputed[0].before).toBe(700);
    expect(preview.data.pendingRecomputed[0].after).toBeUndefined(); // halef kural yok
    expect(preview.data.confirmRequired).toBe(true);
    const del = await removeFeeRuleTool(admin, { ruleId: "fee-t1", mode: "delete", reason: "Artık geçersiz", criticalPassword: "x" });
    expect(del.ok).toBe(false);
    if (del.ok) return;
    expect(del.error.message).toContain("onay");
  });

  it("onaylı silme: kural gider, donmuş defter aynen kalır", async () => {
    await setupCriticalPassword();
    const id = await seedNovember();
    const del = await removeFeeRuleTool(admin, {
      ruleId: "fee-t1",
      mode: "delete",
      reason: "Eski tarife kalktı",
      criticalPassword: TEST_CRITICAL_PASSWORD,
      confirmedImpact: true,
    });
    expect(del.ok).toBe(true);
    const data = await readData();
    expect(data.teacherFeeRules.some((r) => r.id === "fee-t1")).toBe(false);
    const p = data.teacherPayouts.find((x) => x.id === id)!;
    // Donmuş kalemler (tutar + kural izi) silmeden etkilenmez.
    expect(p.totalAmount).toBe(700);
    expect(p.lineSnapshot?.map((l) => [l.feeRuleId, l.amount])).toEqual([["fee-t1", 400], ["fee-t1", 300]]);
    // Bekleyen kayıt halef kural olmadığı için yeniden hesaplanamadı (kayıt aynen durur).
    if (!del.ok) return;
    expect(del.data.failed).toHaveLength(1);
    expect(del.data.pendingRecalculated).toBe(0);
  });

  it("ödemeli kayıt silmede değişmez", async () => {
    await setupCriticalPassword();
    const id = await seedNovember();
    await addTeacherPayoutPaymentTool(admin, { payoutId: id });
    const del = await removeFeeRuleTool(admin, {
      ruleId: "fee-t1",
      mode: "delete",
      reason: "Eski tarife kalktı",
      criticalPassword: TEST_CRITICAL_PASSWORD,
      confirmedImpact: true,
    });
    expect(del.ok).toBe(true);
    const p = await payoutOf(id);
    expect(p.status).toBe("paid");
    expect(p.totalAmount).toBe(700);
    expect(payoutPaidAmount(p)).toBe(700);
  });

  it("tarihten itibaren devre dışı bırakma çalışır; bekleyen kayıt yenilenir", async () => {
    await seedNovember();
    const off = await removeFeeRuleTool(admin, { ruleId: "fee-t1", mode: "deactivate", fromDate: "2026-12-01", reason: "Yeni tarife" });
    expect(off.ok && off.data.effectiveTo).toBe("2026-11-30");
    const rule = (await readData()).teacherFeeRules.find((r) => r.id === "fee-t1")!;
    expect(rule.deactivationReason).toBe("Yeni tarife");
    // Kasım dersleri bitişten önce → aynı kural; bekleyen kayıt yeniden hesaplandı (tutar aynı).
    if (!off.ok) return;
    expect(off.data.pendingRecalculated).toBe(1);
    const data = await readData();
    expect(data.teacherPayouts[0].totalAmount).toBe(700);
  });

  it("devre dışı tarihi kuralın başlangıcından önce olamaz (gerçek neden mesajda)", async () => {
    await seedNovember();
    const off = await removeFeeRuleTool(admin, { ruleId: "fee-t1", mode: "deactivate", fromDate: "2020-01-01", reason: "Hatalı tarih" });
    expect(off.ok).toBe(false);
    if (off.ok) return;
    expect(off.error.message).toContain("2020-01-01");
  });
});
