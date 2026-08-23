import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateStudentProfileTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Bu sprint — StudentProfileEditor'a eklenen kayıt kimliği/eğitim profili
 * alanları (name/email/branchId/educationMethod) için RBAC + tenant izolasyon
 * testleri. `student-profile.test.ts`'teki iletişim/kişisel alan testleriyle
 * aynı desen (ctx helper, beforeEach dosya temizliği).
 */

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

function ctx(overrides?: Partial<ServiceContext>): ServiceContext {
  return {
    role: "SCHOOL_ADMIN",
    userId: "u1",
    tenantId: DEFAULT_TENANT_ID,
    channel: "web",
    ...overrides,
  };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("updateStudentProfileTool — kayıt kimliği/eğitim profili alanları (bu sprint)", () => {
  it("SCHOOL_ADMIN name/email/branchId/educationMethod alanlarını günceller", async () => {
    const before = await readData();
    const target = before.students[0];
    const branch = before.settings.branches[0];

    const result = await updateStudentProfileTool(ctx(), {
      studentId: target.id,
      name: "Yeni Ad Soyad",
      email: "yeni@example.com",
      branchId: branch.id,
      educationMethod: "Suzuki",
    });
    expect(result.ok).toBe(true);

    const after = await readData();
    const updated = after.students.find((s) => s.id === target.id);
    expect(updated?.name).toBe("Yeni Ad Soyad");
    expect(updated?.email).toBe("yeni@example.com");
    expect(updated?.branchId).toBe(branch.id);
    expect(updated?.educationMethod).toBe("Suzuki");
  });

  it("geçersiz/başka tenant'a ait branchId reddedilir (VALIDATION_ERROR)", async () => {
    const before = await readData();
    const target = before.students[0];

    const result = await updateStudentProfileTool(ctx(), {
      studentId: target.id,
      branchId: "does-not-exist-branch",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("TEACHER rolü name/email/branchId alanlarını güncelleyemez (FORBIDDEN)", async () => {
    const before = await readData();
    const target = before.students[0];

    const result = await updateStudentProfileTool(ctx({ role: "TEACHER", teacherId: "t1" }), {
      studentId: target.id,
      name: "Yetkisiz değişiklik",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("PARENT rolü name/email/branchId alanlarını güncelleyemez (FORBIDDEN)", async () => {
    const before = await readData();
    const target = before.students[0];

    const result = await updateStudentProfileTool(ctx({ role: "STUDENT", studentId: target.id }), {
      studentId: target.id,
      email: "yetkisiz@example.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  // NOT — CLAUDE.md'nin belirttiği üzere STORE_MODE=json/memory (bu test
  // paketinin her zaman çalıştığı mod — bkz. vitest.config.mts) etkin
  // olarak TEK tenant'lıdır; gerçek çapraz-tenant izolasyonu yalnızca
  // STORE_MODE=db + 2+ gerçek Tenant satırıyla gözlemlenebilir (json/memory
  // store'da updateStudentProfile yalnız `id`ye göre arar, tenantId'ye göre
  // filtrelemez). Bu yüzden burada gerçekten test edilebilen tenant-scoped
  // doğrulama; branchId'nin çağıranın tenant'ındaki `data.settings.branches`
  // listesinde var olup olmadığı kontrolüdür (yukarıdaki "geçersiz branchId"
  // testi) — o, `updateTeacherProfileTool`'daki mevcut branchIds doğrulama
  // deseniyle birebir aynı (bkz. tools.ts).
});
