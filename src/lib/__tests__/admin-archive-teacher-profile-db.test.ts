import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regresyon (2026-09-17) — db modunda `updateStudentProfile` `active`/
 * `archivedAt` alanlarını Prisma'ya HİÇ yazmıyordu: "Pasife Al" başarılı
 * dönüyor, öğrenci aktif kalıyordu (test sisteminde görülen hata). Aynı
 * eşleme boşluğu öğretmen genel bilgi alanlarında da vardı. Prisma mock'lanır;
 * `updateMany` payload'u yakalanıp reddedilir ki ardından gelen tam
 * `readData()` sorgusu çalışmasın (bkz. student-birthdate-db.test.ts).
 */
const mocks = vi.hoisted(() => ({
  studentUpdateMany: vi.fn(),
  teacherUpdateMany: vi.fn(),
}));

vi.mock("../db", () => ({
  prisma: {
    student: { updateMany: mocks.studentUpdateMany },
    teacher: { updateMany: mocks.teacherUpdateMany },
  },
}));

import { runWithTenantAsync } from "../tenant-context";
import { updateStudentProfile, updateTeacherProfile } from "../store-db";

const STOP = new Error("STOP_AFTER_PAYLOAD");

beforeEach(() => {
  mocks.studentUpdateMany.mockReset().mockRejectedValue(STOP);
  mocks.teacherUpdateMany.mockReset().mockRejectedValue(STOP);
});

describe("db modu — öğrenci pasife alma/aktifleştirme Prisma'ya yazılır", () => {
  it("pasife al: active=false + archivedAt Date", async () => {
    await expect(
      runWithTenantAsync("t1", () =>
        updateStudentProfile("s1", { active: false, archivedAt: "2026-09-17T10:00:00.000Z" })
      )
    ).rejects.toBe(STOP);
    const data = mocks.studentUpdateMany.mock.calls[0]![0].data;
    expect(data.active).toBe(false);
    expect((data.archivedAt as Date).toISOString()).toBe("2026-09-17T10:00:00.000Z");
  });

  it("aktifleştir: active=true + archivedAt null (eski tarih temizlenir)", async () => {
    await expect(
      runWithTenantAsync("t1", () => updateStudentProfile("s1", { active: true, archivedAt: undefined }))
    ).rejects.toBe(STOP);
    const data = mocks.studentUpdateMany.mock.calls[0]![0].data;
    expect(data.active).toBe(true);
    expect(data.archivedAt).toBeNull();
  });

  it("ilgisiz profil güncellemesi active/archivedAt'e dokunmaz", async () => {
    await expect(runWithTenantAsync("t1", () => updateStudentProfile("s1", { name: "Ad" }))).rejects.toBe(STOP);
    const data = mocks.studentUpdateMany.mock.calls[0]![0].data;
    expect(data.active).toBeUndefined();
    expect(data.archivedAt).toBeUndefined();
  });

  it("T.C. kimlik şifreli alanları da yazılır", async () => {
    await expect(
      runWithTenantAsync("t1", () => updateStudentProfile("s1", { nationalIdCipher: "c", nationalIdLast2: "42" }))
    ).rejects.toBe(STOP);
    expect(mocks.studentUpdateMany.mock.calls[0]![0].data).toMatchObject({ nationalIdCipher: "c", nationalIdLast2: "42" });
  });
});

describe("db modu — öğretmen genel bilgileri Prisma'ya yazılır", () => {
  it("lise/üniversite/mezuniyet/günlük limit + doğum tarihi UTC öğlen", async () => {
    await expect(
      runWithTenantAsync("t1", () =>
        updateTeacherProfile("t1", {
          highSchool: "Lise",
          university: "Üni",
          graduationYear: 2010,
          maxDailyLessons: 7,
          birthDate: "1990-04-12",
        })
      )
    ).rejects.toBe(STOP);
    const data = mocks.teacherUpdateMany.mock.calls[0]![0].data;
    expect(data).toMatchObject({ highSchool: "Lise", university: "Üni", graduationYear: 2010, maxDailyLessons: 7 });
    expect((data.birthDate as Date).toISOString()).toBe("1990-04-12T12:00:00.000Z");
  });
});
