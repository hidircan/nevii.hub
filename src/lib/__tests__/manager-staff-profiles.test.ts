/**
 * P1 (2026-09-12) — Ezgi Güçlü + Nihal Gedikli personel kayıtları.
 *
 * YETKİ SINIRI: JWT/portal rolü ve NeviiOS role matrix'e dokunulmaz —
 * kullanıcı oluşturulmaz, rol değiştirilmez. Yalnızca personel kaydı
 * e-posta üzerinden bulunur/oluşturulur ve VARSA portal kullanıcısına
 * bağlanır (Ezgi → user_manager_ezgi; Nihal → bağlantısız, duplicate YOK).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { getUserIdByEmail, authenticateUser } from "../auth/users";
import { STAFF_FILE, listStaff, ensureManagerStaffProfiles } from "../staff";
import { canViewFinanceAndStaffSummary } from "../auth/platform-access";

const EZGI_EMAIL = "ezgi.guclu@niluferacar.com.tr";
const NIHAL_EMAIL = "nihal.gedikli@niluferacar.com.tr";

beforeEach(async () => {
  await fs.rm(STAFF_FILE, { force: true });
});

describe("ensureManagerStaffProfiles", () => {
  it("Ezgi ve Nihal için birer aktif personel kaydı oluşturur; Ezgi bağlı, Nihal bağlantısız", async () => {
    const profiles = await ensureManagerStaffProfiles(DEFAULT_TENANT_ID, "user_owner_nilufer");
    expect(profiles).toHaveLength(2);

    const ezgi = profiles.find((p) => p.email === EZGI_EMAIL);
    const nihal = profiles.find((p) => p.email === NIHAL_EMAIL);
    expect(ezgi?.name).toBe("Ezgi Güçlü");
    expect(ezgi?.status).toBe("active");
    expect(nihal?.name).toBe("Nihal Gedikli");
    expect(nihal?.status).toBe("active");

    // Ezgi'nin portal/login rolü SCHOOL_ADMIN olarak kalır; kaydı bağlıdır.
    expect(ezgi?.portalUserId).toBe("user_manager_ezgi");
    expect(await getUserIdByEmail(DEFAULT_TENANT_ID, EZGI_EMAIL)).toBe("user_manager_ezgi");

    // Nihal: NeviiHub'da portal kullanıcısı YOK → bağlantısız, duplicate YOK.
    expect(nihal?.portalUserId).toBeUndefined();
    expect(await getUserIdByEmail(DEFAULT_TENANT_ID, NIHAL_EMAIL)).toBeNull();
    expect(await authenticateUser(NIHAL_EMAIL, "demo-manager-nihal")).toBeNull();
  });

  it("ikinci çalıştırma duplicate üretmez (idempotent)", async () => {
    await ensureManagerStaffProfiles(DEFAULT_TENANT_ID, "user_owner_nilufer");
    const second = await ensureManagerStaffProfiles(DEFAULT_TENANT_ID, "user_owner_nilufer");
    expect(second).toHaveLength(2);
    const all = await listStaff(DEFAULT_TENANT_ID);
    const ezgiRows = all.filter((s) => s.email === EZGI_EMAIL && s.status === "active");
    const nihalRows = all.filter((s) => s.email === NIHAL_EMAIL && s.status === "active");
    expect(ezgiRows).toHaveLength(1);
    expect(nihalRows).toHaveLength(1);
    // Ezgi bağı ikinci çalıştırmada da korunur.
    expect(second.find((p) => p.email === EZGI_EMAIL)?.portalUserId).toBe("user_manager_ezgi");
  });

  it("mevcut bağlantısız Ezgi kaydını duplicate oluşturmadan bağlar", async () => {
    const { createStaffMember } = await import("../staff");
    const created = await createStaffMember({
      tenantId: DEFAULT_TENANT_ID,
      createdBy: "user_owner_nilufer",
      name: "Ezgi Güçlü",
      email: EZGI_EMAIL,
      position: "Kurum Müdürü",
      status: "active",
    });
    expect(created.ok).toBe(true);

    const profiles = await ensureManagerStaffProfiles(DEFAULT_TENANT_ID, "user_owner_nilufer");
    expect(profiles).toHaveLength(2);
    expect(profiles.find((p) => p.email === EZGI_EMAIL)?.portalUserId).toBe("user_manager_ezgi");
    const all = await listStaff(DEFAULT_TENANT_ID);
    expect(all.filter((s) => s.email === EZGI_EMAIL && s.status === "active")).toHaveLength(1);
  });

  it("kurum sahibi izinli personel görünümünde Ezgi ve Nihal'i görür; tenant dışı göremez", async () => {
    await ensureManagerStaffProfiles(DEFAULT_TENANT_ID, "user_owner_nilufer");
    const visible = await listStaff(DEFAULT_TENANT_ID);
    expect(visible.map((s) => s.email)).toContain(EZGI_EMAIL);
    expect(visible.map((s) => s.email)).toContain(NIHAL_EMAIL);

    const other = await listStaff("tenant_other");
    expect(other.map((s) => s.email)).not.toContain(EZGI_EMAIL);
    expect(other.map((s) => s.email)).not.toContain(NIHAL_EMAIL);
  });

  it("Ezgi için finans/personel-özeti kısıtı korunur; rol dönüşümü yoktur", async () => {
    await ensureManagerStaffProfiles(DEFAULT_TENANT_ID, "user_owner_nilufer");
    expect(
      canViewFinanceAndStaffSummary({ userId: "user_manager_ezgi", role: "SCHOOL_ADMIN" })
    ).toBe(false);
    // NeviiHub'da Nihal kimliği yoktur — kontrol edilecek bir rol de yoktur.
    expect(await getUserIdByEmail(DEFAULT_TENANT_ID, NIHAL_EMAIL)).toBeNull();
  });
});
