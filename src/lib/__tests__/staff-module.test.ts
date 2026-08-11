import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { listStaffTool, createStaffMemberTool, updateStaffMemberTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STAFF_FILE } from "../staff";

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
  await fs.rm(STAFF_FILE, { force: true });
});

describe("Personel Modülü — createStaffMemberTool/listStaffTool/updateStaffMemberTool", () => {
  it("TEACHER rolü hiçbir uçta erişemez (FORBIDDEN)", async () => {
    const list = await listStaffTool(ctx({ role: "TEACHER" }), {});
    expect(list.ok).toBe(false);
    const create = await createStaffMemberTool(ctx({ role: "TEACHER" }), { name: "Ayşe", position: "Muhasebe" });
    expect(create.ok).toBe(false);
  });

  it("admin yeni personel ekler, liste ve alanlar doğru döner", async () => {
    const created = await createStaffMemberTool(ctx(), {
      name: "Ayşe Yılmaz",
      position: "Muhasebe",
      phone: "0555 000 0000",
      email: "ayse@okul.com",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const list = await listStaffTool(ctx(), {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const entry = list.data.staff.find((s) => s.id === created.data.staffId);
    expect(entry).toBeDefined();
    expect(entry?.name).toBe("Ayşe Yılmaz");
    expect(entry?.position).toBe("Muhasebe");
    expect(entry?.status).toBe("active");
  });

  it("ad/rol boşsa VALIDATION_ERROR ile reddedilir", async () => {
    const res = await createStaffMemberTool(ctx(), { name: "", position: "Muhasebe" });
    expect(res.ok).toBe(false);
  });

  it("aktif/pasif toggle kalıcı olarak günceller (hard delete yok)", async () => {
    const created = await createStaffMemberTool(ctx(), { name: "Deniz Kaya", position: "Resepsiyon" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updateStaffMemberTool(ctx(), { staffId: created.data.staffId, status: "passive" });
    expect(updated.ok).toBe(true);

    const list = await listStaffTool(ctx(), {});
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const entry = list.data.staff.find((s) => s.id === created.data.staffId);
    expect(entry?.status).toBe("passive");
    // Hard delete yok — kayıt hâlâ listede.
    expect(entry).toBeDefined();
  });

  it("var olmayan staffId güncellemesi bulunamadı hatası döner", async () => {
    const res = await updateStaffMemberTool(ctx(), { staffId: "does-not-exist", status: "passive" });
    expect(res.ok).toBe(false);
  });
});
