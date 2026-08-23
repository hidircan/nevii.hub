import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import {
  STUDENT_PORTAL_ACCESS_FILE,
  hasActiveStudentAccess,
  getActiveAccessType,
} from "../student-portal-access";
import { canAccessStudent, type ServiceContext } from "../services/context";

/**
 * CANLI ORTAMDA BULUNAN REGRESYON — STORE_MODE=json/memory'de BOOTSTRAP
 * kimlikleri (`user_student_s1` vb., src/lib/auth/users.ts HASHED) için
 * hiçbir StudentPortalAccess satırı YOK (bu iki mod migration/seed betiği
 * çalıştırmaz). Bu fallback olmadan, demo hesaplarının HİÇBİRİ kendi
 * verisine erişemezdi — canlı sunucuda `user_student_s1` kendi ödemesi
 * için checkout başlatırken FORBIDDEN alıyordu (bkz. final rapor).
 */
describe("StudentPortalAccess — STORE_MODE=json bootstrap fallback (canlı regresyon)", () => {
  beforeEach(async () => {
    await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
  });

  it("hiçbir StudentPortalAccess satırı yokken bootstrap user_student_s1 kendi öğrencisine (s1) erişebilir", async () => {
    expect(await hasActiveStudentAccess(DEFAULT_TENANT_ID, "user_student_s1", "s1")).toBe(true);
    expect(await getActiveAccessType(DEFAULT_TENANT_ID, "user_student_s1", "s1")).toBe("SELF");
  });

  it("bootstrap user_parent_s1 (artık STUDENT rolü) da kendi bağlı öğrencisine (s1) erişebilir", async () => {
    expect(await hasActiveStudentAccess(DEFAULT_TENANT_ID, "user_parent_s1", "s1")).toBe(true);
  });

  it("bootstrap kullanıcı BAŞKA bir öğrenciye (s4) erişemez — fallback yalnızca KENDİ studentId'sine izin verir", async () => {
    expect(await hasActiveStudentAccess(DEFAULT_TENANT_ID, "user_student_s1", "s4")).toBe(false);
  });

  it("başka tenant'ta aynı userId erişim kazanamaz", async () => {
    expect(await hasActiveStudentAccess("tenant_other", "user_student_s1", "s1")).toBe(false);
  });

  it("canAccessStudent (tools katmanının kullandığı gerçek fonksiyon) bootstrap kullanıcı için true döner", async () => {
    const ctx: ServiceContext = { role: "STUDENT", userId: "user_student_s1", tenantId: DEFAULT_TENANT_ID, channel: "web" };
    expect(await canAccessStudent(ctx, "s1")).toBe(true);
    expect(await canAccessStudent(ctx, "s4")).toBe(false);
  });

  it("gerçek bir StudentPortalAccess satırı varsa fallback yerine ONA öncelik verilir", async () => {
    const { grantActiveStudentPortalAccess } = await import("../student-portal-access");
    await grantActiveStudentPortalAccess({
      tenantId: DEFAULT_TENANT_ID,
      userId: "user_student_s1",
      studentId: "s1",
      accessType: "GUARDIAN",
      invitedBy: "test",
    });
    // Explicit kayıt GUARDIAN diyor — fallback'in SELF varsayımı EZİLMELİ.
    expect(await getActiveAccessType(DEFAULT_TENANT_ID, "user_student_s1", "s1")).toBe("GUARDIAN");
  });
});
