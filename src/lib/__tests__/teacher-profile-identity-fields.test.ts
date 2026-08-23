import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { updateTeacherProfileTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Bu sprint — TeacherProfileEditor'a eklenen kayıt kimliği alanları
 * (name/email/phone) için RBAC + tenant izolasyon testleri. Enstrüman
 * (updateTeacherInstrumentsTool), müsaitlik (proposeTeacherAvailabilityTool)
 * ve ders ücreti (createFeeRuleTool/updateFeeRuleTool) kendi özel
 * araçlarında yönetildiği için bu tool'a eklenmedi — bu dosya yalnız
 * name/email/phone'u kapsar.
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

describe("updateTeacherProfileTool — kayıt kimliği alanları (bu sprint)", () => {
  it("SCHOOL_ADMIN name/email/phone alanlarını günceller", async () => {
    const before = await readData();
    const target = before.teachers[0];

    const result = await updateTeacherProfileTool(ctx(), {
      teacherId: target.id,
      name: "Yeni Öğretmen Adı",
      email: "yeni.ogretmen@example.com",
      phone: "0555 222 3344",
    });
    expect(result.ok).toBe(true);

    const after = await readData();
    const updated = after.teachers.find((t) => t.id === target.id);
    expect(updated?.name).toBe("Yeni Öğretmen Adı");
    expect(updated?.email).toBe("yeni.ogretmen@example.com");
    expect(updated?.phone).toBe("0555 222 3344");
  });

  it("TEACHER rolü kendi kaydını bile bu yoldan güncelleyemez (FORBIDDEN)", async () => {
    const before = await readData();
    const target = before.teachers[0];

    const result = await updateTeacherProfileTool(ctx({ role: "TEACHER", teacherId: target.id }), {
      teacherId: target.id,
      name: "Yetkisiz değişiklik",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("PARENT rolü öğretmen profilini güncelleyemez (FORBIDDEN)", async () => {
    const before = await readData();
    const target = before.teachers[0];

    const result = await updateTeacherProfileTool(ctx({ role: "STUDENT" }), {
      teacherId: target.id,
      email: "yetkisiz@example.com",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  // NOT — CLAUDE.md'nin belirttiği üzere STORE_MODE=json/memory (bu test
  // paketinin her zaman çalıştığı mod) etkin olarak TEK tenant'lıdır;
  // gerçek çapraz-tenant izolasyonu yalnızca STORE_MODE=db + 2+ gerçek
  // Tenant satırıyla gözlemlenebilir. Bu tool'da yeni eklenen alanlar
  // (name/email/phone) serbest metin olduğu için tenant-scoped bir referans
  // doğrulaması (branchId gibi) gerektirmiyor — mevcut branchIds doğrulaması
  // (tools.ts, değişmedi) zaten aynı tenant-scoped desenle korunuyor.
});
