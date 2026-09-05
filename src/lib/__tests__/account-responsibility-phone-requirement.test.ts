import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createStudentTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Regresyon — kullanıcı raporu: "Ödeme-İletişim Muhatabına göre zorunlu
 * telefon doğrulaması" (2026-09-05). Önceden `phone`/`parentPhone` KOŞULSUZ
 * zorunluydu — personel muhatap olmayan tarafın telefonunu da uydurmak
 * zorunda kalıyordu. Artık yalnızca `accountResponsibility`'nin işaret
 * ettiği taraf zorunlu; diğeri boş bırakılabilir ve `createStudentTool`
 * eksik kalanı diğerinin numarasıyla doldurur (bkz. tools.ts — `Student.
 * phone`/`parentPhone` modeli hâlâ her zaman dolu, bildirim akışları etkilenmez).
 */
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  vi.clearAllMocks();
});

function baseInput(overrides?: Record<string, unknown>) {
  return {
    name: "Muhatap Testi",
    parentName: "Veli",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "t1",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
    enrollmentStartDate: "2026-09-01",
    ...overrides,
  };
}

describe("createStudentTool — accountResponsibility'e göre koşullu telefon zorunluluğu", () => {
  it("PARENT_MANAGED (varsayılan) + veli telefonu YOK → reddedilir, alan hatası parentPhone'da", async () => {
    const res = await createStudentTool(ctx(), baseInput({ accountResponsibility: "PARENT_MANAGED", phone: "5551112233" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.details as unknown as { fieldErrors?: Record<string, string[]> }).toMatchObject({
      fieldErrors: { parentPhone: expect.arrayContaining([expect.stringContaining("Veli telefon")]) as unknown },
    });
  });

  it("PARENT_MANAGED + veli telefonu VAR + öğrenci telefonu YOK → kabul edilir, öğrenci telefonu veli telefonuyla doldurulur", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({ accountResponsibility: "PARENT_MANAGED", parentPhone: "5559998877" })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { readData } = await import("../store-json");
    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId)!;
    expect(created.parentPhone).toBe("5559998877");
    expect(created.phone).toBe("5559998877"); // eksik kalan taraf diğerinin numarasıyla dolduruldu
  });

  it("SELF_MANAGED + öğrenci telefonu YOK → reddedilir, alan hatası phone'da", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({ accountResponsibility: "SELF_MANAGED", parentPhone: "5551112233" })
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect(res.error.details as unknown as { fieldErrors?: Record<string, string[]> }).toMatchObject({
      fieldErrors: { phone: expect.arrayContaining([expect.stringContaining("Öğrenci telefon")]) as unknown },
    });
  });

  it("SELF_MANAGED + öğrenci telefonu VAR + veli telefonu YOK → kabul edilir, veli telefonu öğrenci telefonuyla doldurulur", async () => {
    const res = await createStudentTool(ctx(), baseInput({ accountResponsibility: "SELF_MANAGED", phone: "5551239999" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { readData } = await import("../store-json");
    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId)!;
    expect(created.phone).toBe("5551239999");
    expect(created.parentPhone).toBe("5551239999");
  });

  /**
   * P0 (2026-09-05, ikinci tur) — AYNI kural VELİ ADI için de geçerli:
   * SELF_MANAGED'de personel var olmayan bir veli adı uydurmak zorunda
   * kalmamalı; PARENT_MANAGED'de ise veli adı gerçekten zorunlu olmalı ve
   * hata jenerik "Invalid input" değil, ALANA ait Türkçe metin olmalı.
   */
  it("PARENT_MANAGED + veli adı YOK → reddedilir, alan hatası parentName'de ve Türkçe", async () => {
    const input = baseInput({ accountResponsibility: "PARENT_MANAGED", parentPhone: "5559998877" });
    delete (input as Record<string, unknown>).parentName;
    const res = await createStudentTool(ctx(), input);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    const details = res.error.details as unknown as { fieldErrors?: Record<string, string[]> };
    expect(details.fieldErrors?.parentName?.[0]).toContain("Veli adı soyadı zorunludur");
    expect(details.fieldErrors?.parentName?.[0]).not.toContain("Invalid input");
  });

  it("SELF_MANAGED + veli adı YOK → kabul edilir, parentName öğrencinin kendi adıyla doldurulur", async () => {
    const input = baseInput({ accountResponsibility: "SELF_MANAGED", phone: "5551239999" });
    delete (input as Record<string, unknown>).parentName;
    const res = await createStudentTool(ctx(), input);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { readData } = await import("../store-json");
    const data = await readData();
    const created = data.students.find((s) => s.id === res.data.studentId)!;
    expect(created.parentName).toBe("Muhatap Testi");
  });

  it("SELF_MANAGED + veli adı VERİLDİ → opsiyonel alan olarak aynen saklanır", async () => {
    const res = await createStudentTool(
      ctx(),
      baseInput({ accountResponsibility: "SELF_MANAGED", phone: "5551239999", parentName: "İsteğe Bağlı Veli" })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { readData } = await import("../store-json");
    const data = await readData();
    expect(data.students.find((s) => s.id === res.data.studentId)!.parentName).toBe("İsteğe Bağlı Veli");
  });

  it("accountResponsibility belirtilmemiş (ör. CSV import/eski çağıran) → eski davranış korunur: veli telefonu zorunlu", async () => {
    const res = await createStudentTool(ctx(), baseInput({ phone: "5551112233" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
  });
});
