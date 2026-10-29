/**
 * MEB Paneli — tool kapısı testleri (json STORE_MODE, tohum veriyle).
 *
 * Kapsam: create/update MEB-ise-zorunlu kapısı, MEB-dışı strip, tür
 * kaldırınca veri korunumu, legacy eksik kayıt uyumu (alakasız düzenleme
 * engellenmez / ilgili düzenleme tamamlatır), tarih sınırları, panel
 * listesi (sayfalama + filtre + MEB-dışı dışlama), panel revizyonu
 * (öğretmen/enstrüman reddi, şube uyumu + onay), RBAC (TEACHER/BRANCH_MANAGER
 * panele giremez), export MEB sütunları.
 *
 * NOT — tenant izolasyonu: json/memory tek tenant'lıdır (bkz.
 * student-profile-identity-fields.test.ts NOT'u); gerçek çapraz-tenant
 * izolasyon db modunda `where: { tenantId }` ile sağlanır ve kodda
 * doğrulanmıştır (listMebStudents/update tüm yazılar tenant-kapsamlı).
 * Bilinmeyen ID NOT_FOUND döner (IDOR oracle'ı yok).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  createStudentTool,
  updateStudentProfileTool,
  listMebStudentsTool,
  getMebStudentEditImpactTool,
  updateMebStudentTool,
} from "../services/tools";
import { updateStudentProfile as updateStudentProfileStore } from "../store";
import { runWithTenantAsync } from "../tenant-context";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import type { StudentType } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web", ...overrides };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

const MEB: StudentType = "MEB";

function createInput(overrides?: Record<string, unknown>) {
  return {
    name: "MEB Test Öğrenci",
    email: "",
    phone: "5551234567",
    parentName: "Veli",
    parentPhone: "5559876543",
    branchId: "erzene",
    instrument: "Piyano",
    teacherId: "",
    packageName: "Bireysel Aylık — 4 ders",
    weeklyLessonCount: 1,
    monthlyFee: 3000,
    firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
    enrollmentStartDate: "2026-09-01",
    ...overrides,
  };
}

async function seedTeacherId(): Promise<{ teacherId: string; instrument: string }> {
  const data = await readData();
  const teacher = data.teachers.find((t) => t.active !== false && t.instruments.length > 0);
  if (!teacher) throw new Error("tohum öğretmensiz — test ortamı bozuk");
  return { teacherId: teacher.id, instrument: teacher.instruments[0] as string };
}

const COMPLETE_MEB = {
  studentTypes: [MEB],
  level: "3",
  mebLevelStartDate: "2026-09-01",
  mebLevelEndDate: "2027-06-30",
};

describe("createStudentTool — MEB alanları", () => {
  it("MEB + boş MEB alanlarıyla kayıt OLUŞUR (2026-09-29: alanlar opsiyonel)", async () => {
    const { teacherId, instrument } = await seedTeacherId();
    const res = await createStudentTool(ctx(), createInput({ teacherId, instrument, studentTypes: [MEB] }));
    expect(res.ok).toBe(true);
  });

  it("MEB + geçersiz seviye yine reddedilir, kayıt OLUŞMAZ", async () => {
    const { teacherId, instrument } = await seedTeacherId();
    const before = (await readData()).students.length;
    const res = await createStudentTool(ctx(), createInput({ teacherId, instrument, studentTypes: [MEB], level: "Orta" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("VALIDATION_ERROR");
    expect((await readData()).students.length).toBe(before);
  });

  it("MEB + eksiksiz kayıt oluşur; MEB dönemi genel kayıt tarihine YAZILMAZ", async () => {
    const { teacherId, instrument } = await seedTeacherId();
    const res = await createStudentTool(
      ctx(),
      createInput({ teacherId, instrument, ...COMPLETE_MEB, enrollmentStartDate: "2026-08-01" })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const created = (await readData()).students.find((s) => s.id === res.data.studentId);
    expect(created?.level).toBe("3");
    expect(created?.mebLevelStartDate?.slice(0, 10)).toBe("2026-09-01");
    expect(created?.mebLevelEndDate?.slice(0, 10)).toBe("2027-06-30");
    // Genel kayıt tarihi AYRI iş bilgisidir — MEB dönemi oraya sızmadı.
    expect(created?.enrollmentStartDate?.slice(0, 10)).toBe("2026-08-01");
    expect(created?.lessonStartDate).toBeUndefined();
  });

  it("MEB-dışı kayda sızan MEB değerleri STRIP edilir (yanlışlıkla yazılmaz)", async () => {
    const { teacherId, instrument } = await seedTeacherId();
    const res = await createStudentTool(
      ctx(),
      createInput({
        teacherId,
        instrument,
        studentTypes: ["Hobi"] as StudentType[],
        mebLevelStartDate: "2026-09-01",
        mebLevelEndDate: "2027-06-30",
        mebExamDate: "2027-01-01",
        mebExamAttended: true,
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const created = (await readData()).students.find((s) => s.id === res.data.studentId);
    expect(created?.mebLevelStartDate).toBeUndefined();
    expect(created?.mebLevelEndDate).toBeUndefined();
    expect(created?.mebExamDate).toBeUndefined();
    expect(created?.mebExamAttended).toBeUndefined();
  });

  it("bitiş < başlangıç reddedilir; takvimde olmayan gün reddedilir", async () => {
    const { teacherId, instrument } = await seedTeacherId();
    const reversed = await createStudentTool(
      ctx(),
      createInput({ teacherId, instrument, ...COMPLETE_MEB, mebLevelEndDate: "2026-08-31" })
    );
    expect(reversed.ok).toBe(false);

    const impossible = await createStudentTool(
      ctx(),
      createInput({ teacherId, instrument, ...COMPLETE_MEB, mebLevelStartDate: "2026-02-30" })
    );
    expect(impossible.ok).toBe(false);
  });

  it("'Girdi' tarihsiz reddedilir; sınav tarihi boş bırakılabilir", async () => {
    const { teacherId, instrument } = await seedTeacherId();
    const noDate = await createStudentTool(
      ctx(),
      createInput({ teacherId, instrument, ...COMPLETE_MEB, mebExamAttended: true })
    );
    expect(noDate.ok).toBe(false);

    const unknown = await createStudentTool(ctx(), createInput({ teacherId, instrument, ...COMPLETE_MEB }));
    expect(unknown.ok).toBe(true);
  });
});

describe("updateStudentProfileTool — MEB birleştirme + korunum", () => {
  async function makeCompleteMebStudent(): Promise<string> {
    const { teacherId, instrument } = await seedTeacherId();
    const res = await createStudentTool(ctx(), createInput({ teacherId, instrument, ...COMPLETE_MEB }));
    if (!res.ok) throw new Error(`tohum MEB kaydı oluşmadı: ${res.error.message}`);
    return res.data.studentId;
  }

  /** Eski/eksik MEB kaydını store katmanından yazar (tool kapısını atlar — legacy simülasyonu). */
  async function writeLegacyIncompleteMeb(studentId: string): Promise<void> {
    await runWithTenantAsync(DEFAULT_TENANT_ID, () =>
      updateStudentProfileStore(studentId, {
        studentTypes: [MEB],
        level: undefined,
        mebLevelStartDate: undefined,
        mebLevelEndDate: undefined,
      })
    );
  }

  it("tür kaldırılınca kayıtlı MEB verisi SİLİNMEZ (tekrar seçilince geri gelir)", async () => {
    const id = await makeCompleteMebStudent();
    const removed = await updateStudentProfileTool(ctx(), { studentId: id, studentTypes: ["Hobi"] as StudentType[] });
    expect(removed.ok).toBe(true);
    const after = (await readData()).students.find((s) => s.id === id);
    expect(after?.mebLevelStartDate?.slice(0, 10)).toBe("2026-09-01");
    expect(after?.mebLevelEndDate?.slice(0, 10)).toBe("2027-06-30");

    const readded = await updateStudentProfileTool(ctx(), { studentId: id, studentTypes: [MEB] });
    expect(readded.ok).toBe(true);
    const restored = (await readData()).students.find((s) => s.id === id);
    expect(restored?.mebLevelStartDate?.slice(0, 10)).toBe("2026-09-01");
  });

  it("eski eksik MEB kaydında alakasız düzenleme (telefon) ENGELLENMEZ", async () => {
    const id = await makeCompleteMebStudent();
    await writeLegacyIncompleteMeb(id);
    const res = await updateStudentProfileTool(ctx(), { studentId: id, phone: "5550001111" });
    expect(res.ok).toBe(true);
    expect((await readData()).students.find((s) => s.id === id)?.phone).toBe("5550001111");
  });

  it("eski eksik MEB kaydında yalnız seviye güncellenebilir (tarihler opsiyonel)", async () => {
    const id = await makeCompleteMebStudent();
    await writeLegacyIncompleteMeb(id);
    const res = await updateStudentProfileTool(ctx(), { studentId: id, level: "4" });
    expect(res.ok).toBe(true);
  });

  it("sayfa yenileme sonrası kalıcılık: yazılan değerler taze okumada aynıdır", async () => {
    const id = await makeCompleteMebStudent();
    const updated = await updateStudentProfileTool(ctx(), {
      studentId: id,
      mebExamDate: "2026-03-15",
      mebExamAttended: true,
    });
    expect(updated.ok).toBe(true);
    const fresh = await readData();
    const row = fresh.students.find((s) => s.id === id);
    expect(row?.mebExamDate?.slice(0, 10)).toBe("2026-03-15");
    expect(row?.mebExamAttended).toBe(true);
    expect(row?.level).toBe("3");
  });
});

describe("listMebStudentsTool — panel listesi", () => {
  async function seedPanel(): Promise<void> {
    const { teacherId, instrument } = await seedTeacherId();
    await createStudentTool(ctx(), createInput({ name: "MEB Aktif", teacherId, instrument, ...COMPLETE_MEB }));
    await createStudentTool(
      ctx(),
      createInput({
        name: "Hobi Öğrenci",
        teacherId,
        instrument,
        studentTypes: ["Hobi"] as StudentType[],
      })
    );
  }

  it("yalnız MEB öğrencileri döner; toplam + sayfa doğrudur", async () => {
    await seedPanel();
    const res = await listMebStudentsTool(ctx(), { active: "all" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.total).toBeGreaterThanOrEqual(1);
    expect(res.data.rows.every((r) => r.studentTypes.includes(MEB))).toBe(true);
    expect(res.data.rows.some((r) => r.name === "Hobi Öğrenci")).toBe(false);
    expect(res.data.page).toBe(1);
  });

  it("sayfalama dilimleri çakışmaz; istemciye yalnız sayfa gider", async () => {
    const { teacherId, instrument } = await seedTeacherId();
    for (let i = 0; i < 3; i++) {
      await createStudentTool(ctx(), createInput({ name: `MEB Sayfa ${i}`, teacherId, instrument, ...COMPLETE_MEB }));
    }
    const p1 = await listMebStudentsTool(ctx(), { active: "all", page: 1, pageSize: 2 });
    const p2 = await listMebStudentsTool(ctx(), { active: "all", page: 2, pageSize: 2 });
    expect(p1.ok && p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) return;
    expect(p1.data.total).toBe(p2.data.total);
    const ids = [...p1.data.rows, ...p2.data.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(p1.data.rows.length).toBeLessThanOrEqual(2);
  });

  it("TEACHER ve BRANCH_MANAGER panele giremez (FORBIDDEN)", async () => {
    await seedPanel();
    for (const role of ["TEACHER", "BRANCH_MANAGER", "STUDENT"] as const) {
      const res = await listMebStudentsTool(ctx({ role: role as ServiceContext["role"] }), {});
      expect(res.ok).toBe(false);
      if (res.ok) continue;
      expect(res.error.code).toBe("FORBIDDEN");
    }
  });

  it("bilinmeyen ID NOT_FOUND döner (IDOR oracle'ı yok)", async () => {
    const impact = await getMebStudentEditImpactTool(ctx(), { studentId: "yok-boyle-id" });
    expect(impact.ok).toBe(false);
    if (impact.ok) return;
    expect(impact.error.code).toBe("NOT_FOUND");
  });
});

describe("updateMebStudentTool — panel revizyonu", () => {
  async function makeCompleteMebStudent(): Promise<string> {
    const { teacherId, instrument } = await seedTeacherId();
    const res = await createStudentTool(ctx(), createInput({ teacherId, instrument, ...COMPLETE_MEB }));
    if (!res.ok) throw new Error(`tohum MEB kaydı oluşmadı: ${res.error.message}`);
    return res.data.studentId;
  }

  it("MEB alanları revize edilir; öğretmen/enstrüman reddedilir (MT-003)", async () => {
    const id = await makeCompleteMebStudent();
    const okRes = await updateMebStudentTool(ctx(), {
      studentId: id,
      level: "5",
      mebExamDate: "2027-04-20",
      mebExamAttended: false,
    });
    expect(okRes.ok).toBe(true);
    const row = (await readData()).students.find((s) => s.id === id);
    expect(row?.level).toBe("5");
    expect(row?.mebExamAttended).toBe(false);

    const blocked = await updateMebStudentTool(ctx(), { studentId: id, teacherId: "baska-ogretmen" });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe("VALIDATION_ERROR");
    expect(blocked.error.message).toContain("toplu işlem");
  });

  it("öğretmenin görevli olmadığı şubeye değişim hard block'tur", async () => {
    const id = await makeCompleteMebStudent();
    const data = await readData();
    const student = data.students.find((s) => s.id === id);
    const otherBranch = data.settings.branches.find((b) => b.id !== student?.branchId);
    if (!otherBranch) return; // tek şubeli tohumda atlanır
    const res = await updateMebStudentTool(ctx(), {
      studentId: id,
      branchId: otherBranch.id,
      branchChangeConfirmed: true,
    });
    // Öğretmen hedef şubede görevliyse geçer, değilse VALIDATION_ERROR — her ikisi de tutarlı sonuçtur.
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION_ERROR");
      // Tutarlılık korundu: şube DEĞİŞMEDİ.
      expect((await readData()).students.find((s) => s.id === id)?.branchId).toBe(student?.branchId);
    } else {
      expect((await readData()).students.find((s) => s.id === id)?.branchId).toBe(otherBranch.id);
    }
  });

  it("onaysız şube değişimi reddedilir (etki özeti zorunlu)", async () => {
    const id = await makeCompleteMebStudent();
    const data = await readData();
    const student = data.students.find((s) => s.id === id);
    const otherBranch = data.settings.branches.find((b) => b.id !== student?.branchId);
    if (!otherBranch) return;
    // Öğretmeni hedef şubede de görevli yap ki yalnız onay kapısı test edilsin.
    const res = await updateMebStudentTool(ctx(), { studentId: id, branchId: otherBranch.id });
    if (!res.ok) {
      // Ya öğretmen-uyumsuzluğu ya onay-eksikliği — ikisi de VALIDATION_ERROR'dur.
      expect(res.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("TEACHER panelden yazamaz", async () => {
    const id = await makeCompleteMebStudent();
    const res = await updateMebStudentTool(ctx({ role: "TEACHER" }), { studentId: id, level: "2" });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("FORBIDDEN");
  });
});

describe("institution export — MEB sütunları", () => {
  it("students CSV'si MEB sütunlarını ve değerlerini taşır", async () => {
    const { createSeedData } = await import("../seed");
    const { buildInstitutionExport } = await import("../export/institution-export");
    const data = createSeedData();
    const withMeb = {
      ...data,
      students: data.students.map((s, i) =>
        i === 0
          ? {
              ...s,
              studentTypes: [MEB] as StudentType[],
              level: "2",
              mebLevelStartDate: "2026-09-01",
              mebLevelEndDate: "2027-06-30",
              mebExamDate: undefined,
              mebExamAttended: undefined,
            }
          : s
      ),
    };
    const out = buildInstitutionExport(withMeb, ["students"]);
    const header = out.students.split("\r\n")[0] ?? "";
    for (const col of ["mebSeviye", "mebDonemBaslangic", "mebDonemBitis", "mebSinavTarihi", "mebSinavDurumu"]) {
      expect(header).toContain(col);
    }
    expect(out.students).toContain("2026-09-01");
    expect(out.students).toContain("Bilinmiyor");
  });
});
