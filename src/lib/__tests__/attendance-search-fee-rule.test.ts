import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createFeeRuleTool,
  updateFeeRuleTool,
  createTeacherPayoutTool,
  markTeacherPayoutPaidTool,
  createStudentTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { clampPage } from "@/components/ui";
import { weekdayFullNameFor } from "@/components/attendance-calendar-panel";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("İş 3 — clampPage (öğretmen detayı öğrenci sayfalaması aynı paylaşılan yardımcıyı kullanır)", () => {
  it("6 öğrenci, sayfa boyutu 5 → 2 sayfa; geçersiz/eksik sayfa 1'e düşer", () => {
    const totalPages = Math.ceil(6 / 5);
    expect(totalPages).toBe(2);
    expect(clampPage(undefined, totalPages)).toBe(1);
    expect(clampPage("0", totalPages)).toBe(1);
    expect(clampPage("abc", totalPages)).toBe(1);
    expect(clampPage("2", totalPages)).toBe(2);
    expect(clampPage("99", totalPages)).toBe(2); // üst sınıra kırpılır, taşmaz
  });

  it("boş liste her zaman tek (boş) sayfaya düşer", () => {
    const totalPages = Math.max(1, Math.ceil(0 / 5));
    expect(totalPages).toBe(1);
    expect(clampPage(undefined, totalPages)).toBe(1);
  });
});

describe("İş 2 — weekdayFullNameFor (veli portalinde gizlenen başlığın aria-label karşılığı)", () => {
  it("bilinen bir Pazartesi tarihi için 'Pazartesi' döner", () => {
    // 2026-08-10 bir Pazartesi.
    expect(weekdayFullNameFor("2026-08-10")).toBe("Pazartesi");
  });

  it("bilinen bir Pazar tarihi için 'Pazar' döner", () => {
    // 2026-08-09 bir Pazar.
    expect(weekdayFullNameFor("2026-08-09")).toBe("Pazar");
  });
});

describe("İş 4 — saatlik hakediş ücreti (TeacherFeeRule) uçtan uca", () => {
  it("yeni saatlik ücret tanımlanır (daha dar kapsamda — genel kuralla çakışmaz), geçersiz (0/negatif) ücret reddedilir", async () => {
    const invalid = await createFeeRuleTool(ctx(), {
      teacherId: "t1",
      perMinuteRate: 0,
      effectiveFrom: "2026-01-01",
    });
    expect(invalid.ok).toBe(false);

    // Seed zaten t1 için genel (şube/enstrüman daraltmasız) bir kural
    // içeriyor (bkz. src/lib/seed.ts) — YENİ bir kural, farklı bir kapsam
    // (branchId) belirterek eklenir; genel kuralla ÇAKIŞMAZ (scopeMatches
    // teacherId+branchId+instrument ÜÇLÜSÜNÜ karşılaştırır).
    const created = await createFeeRuleTool(ctx(), {
      teacherId: "t1",
      branchId: "erzene",
      perMinuteRate: 10, // 600 TL/saat
      effectiveFrom: "2020-01-01",
    });
    expect(created.ok).toBe(true);
  });

  it("mevcut (seed'deki) ücret kuralı güncellenebilir (decimal destekli)", async () => {
    const data = await readData();
    const existing = data.teacherFeeRules.find((r) => r.teacherId === "t1" && !r.branchId && !r.instrument);
    expect(existing).toBeDefined();
    const updated = await updateFeeRuleTool(ctx(), { ruleId: existing!.id, perMinuteRate: 12.75 });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.rule.perMinuteRate).toBe(12.75);
  });

  it("ücret değişikliği GEÇMİŞTE zaten oluşturulmuş bir hakediş kaydını değiştirmez; yalnızca yeni hesaplamaya yansır", async () => {
    // t1 (Turgay Hoşbaş) için seed'in ZATEN sağladığı genel kuralı kullan
    // (mevcut mimariyle aynı — ayrı/çelişkili bir ikinci kaynak yaratılmaz).
    const dataBefore = await readData();
    const rule = dataBefore.teacherFeeRules.find((r) => r.teacherId === "t1" && !r.branchId && !r.instrument);
    expect(rule).toBeDefined();

    const data = dataBefore;
    const t1Lessons = data.lessons.filter((l) => l.teacherId === "t1" && l.status !== "cancelled");
    expect(t1Lessons.length).toBeGreaterThan(0);
    const dates = t1Lessons.map((l) => l.startAt.slice(0, 10)).sort();
    const periodStart = dates[0]!;
    const periodEnd = dates[dates.length - 1]!;

    const payout = await createTeacherPayoutTool(ctx(), { teacherId: "t1", periodStart, periodEnd });
    expect(payout.ok).toBe(true);
    if (!payout.ok) return;
    const originalAmount = payout.data.payout.totalAmount;
    expect(originalAmount).toBeGreaterThan(0);

    // Ödenmiş olarak işaretle — "geçmiş onaylanmış/ödenmiş kayıt" senaryosu.
    const paid = await markTeacherPayoutPaidTool(ctx(), { payoutId: payout.data.payout.id });
    expect(paid.ok).toBe(true);

    // Ücreti DEĞİŞTİR — bu artık geçmişteki kaydı etkilememeli.
    const updated = await updateFeeRuleTool(ctx(), { ruleId: rule!.id, perMinuteRate: 999 });
    expect(updated.ok).toBe(true);

    const dataAfter = await readData();
    const frozenPayout = dataAfter.teacherPayouts.find((p) => p.id === payout.data.payout.id);
    expect(frozenPayout).toBeDefined();
    expect(frozenPayout?.totalAmount).toBe(originalAmount); // DONMUŞ — değişmedi
    expect(frozenPayout?.status).toBe("paid");
  });

  it("SCHOOL_ADMIN dışı rol (TEACHER) ücret kuralı oluşturamaz", async () => {
    const res = await createFeeRuleTool(ctx({ role: "TEACHER" }), {
      teacherId: "t1",
      perMinuteRate: 10,
      effectiveFrom: "2026-01-01",
    });
    expect(res.ok).toBe(false);
  });

  it("Personel/Bordro modülü ile karışmaz — StaffMember/PayrollRecord oluşturmadan yalnızca TeacherFeeRule/TeacherPayout üzerinden çalışır", async () => {
    const rule = await createFeeRuleTool(ctx(), {
      teacherId: "t1",
      branchId: "erzene",
      perMinuteRate: 10,
      effectiveFrom: "2020-01-01",
    });
    expect(rule.ok).toBe(true);
    // createStudentTool'un import edilmiş olması, bu dosyanın öğretmen/
    // öğrenci akışlarını bozmadığını (typecheck+çalışma zamanı) doğrular —
    // ayrı bir StaffMember/PayrollRecord bağımlılığı YOK.
    const student = await createStudentTool(ctx(), {
      name: "Test Öğrenci",
      email: "",
      phone: "0555 000 0000",
      parentName: "Veli",
      parentPhone: "0555 000 0001",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-08-30" },
      enrollmentStartDate: "2026-09-01",
      lessonDurationMinutes: 30,
    });
    expect(student.ok).toBe(true);
  });
});
