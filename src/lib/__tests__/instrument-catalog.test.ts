import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import {
  listInstrumentCatalogTool,
  createInstrumentCatalogTool,
  updateInstrumentCatalogTool,
  createTeacherTool,
} from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const CATALOG_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "instrument-catalog.json");
const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const OTHER_TENANT = "other-tenant-instr-test";

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
  await fs.rm(CATALOG_FILE, { force: true });
  await fs.rm(DATA_FILE, { force: true });
});

describe("ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu", () => {
  it("kataloğu ilk kez okuyunca Bas Gitar ve Ukulele otomatik, aktif olarak seed edilir", async () => {
    const res = await listInstrumentCatalogTool(ctx(), {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const names = res.data.entries.map((e) => e.name);
    expect(names).toContain("Bas Gitar");
    expect(names).toContain("Ukulele");
    expect(res.data.entries.every((e) => e.status === "active")).toBe(true);
    // Temel sabit liste de birlikte döner (server-side doğrulamanın tek kaynağı olarak kullanılabilsin diye).
    expect(res.data.staticInstruments).toContain("Piyano");
  });

  it("admin yeni enstrüman ekleyebilir", async () => {
    const res = await createInstrumentCatalogTool(ctx(), { name: "Marimba" });
    expect(res.ok).toBe(true);
    const list = await listInstrumentCatalogTool(ctx(), {});
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.entries.some((e) => e.name === "Marimba" && e.status === "active")).toBe(true);
  });

  it("aynı isim (harf büyüklüğünden bağımsız) yinelenen olarak eklenemez", async () => {
    const first = await createInstrumentCatalogTool(ctx(), { name: "Kanun" });
    expect(first.ok).toBe(true);
    const dup = await createInstrumentCatalogTool(ctx(), { name: "kanun" });
    expect(dup.ok).toBe(false);
    const dup2 = await createInstrumentCatalogTool(ctx(), { name: "KANUN" });
    expect(dup2.ok).toBe(false);
  });

  it("sabit temel enstrümanla (ör. Piyano) aynı isimde kayıt eklenemez", async () => {
    const res = await createInstrumentCatalogTool(ctx(), { name: "piyano" });
    expect(res.ok).toBe(false);
  });

  it("admin bir enstrümanı yeniden adlandırabilir ve pasife alıp geri aktifleştirebilir", async () => {
    const created = await createInstrumentCatalogTool(ctx(), { name: "Org" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const renamed = await updateInstrumentCatalogTool(ctx(), { entryId: created.data.entryId, name: "Elektronik Org" });
    expect(renamed.ok).toBe(true);

    const archived = await updateInstrumentCatalogTool(ctx(), { entryId: created.data.entryId, status: "archived" });
    expect(archived.ok).toBe(true);

    let list = await listInstrumentCatalogTool(ctx(), {});
    expect(list.ok).toBe(true);
    if (list.ok) {
      const entry = list.data.entries.find((e) => e.id === created.data.entryId);
      expect(entry?.name).toBe("Elektronik Org");
      expect(entry?.status).toBe("archived"); // pasif — yeni seçimde görünmemeli (UI tarafı bunu filtreler)
    }

    const restored = await updateInstrumentCatalogTool(ctx(), { entryId: created.data.entryId, status: "active" });
    expect(restored.ok).toBe(true);
    list = await listInstrumentCatalogTool(ctx(), {});
    if (list.ok) {
      const entry = list.data.entries.find((e) => e.id === created.data.entryId);
      expect(entry?.status).toBe("active"); // geçmiş kayıt (id) korunuyor — hard delete yok
    }
  });

  it("TEACHER/PARENT rolü enstrüman ekleyemez/düzenleyemez (RBAC) ama listeyi okuyabilir", async () => {
    const createRes = await createInstrumentCatalogTool(ctx({ role: "TEACHER", teacherId: "t1" }), { name: "Cajon" });
    expect(createRes.ok).toBe(false);

    const updateRes = await updateInstrumentCatalogTool(ctx({ role: "STUDENT", studentId: "s1" }), {
      entryId: "whatever",
      status: "archived",
    });
    expect(updateRes.ok).toBe(false);

    const readRes = await listInstrumentCatalogTool(ctx({ role: "TEACHER", teacherId: "t1" }), {});
    expect(readRes.ok).toBe(true);
  });

  it("tenantlar birbirinin enstrüman kataloğunu göremez/etkilemez", async () => {
    await createInstrumentCatalogTool(ctx(), { name: "Tenant A Özel" });

    const otherTenantList = await listInstrumentCatalogTool(ctx({ tenantId: OTHER_TENANT }), {});
    expect(otherTenantList.ok).toBe(true);
    if (otherTenantList.ok) {
      expect(otherTenantList.data.entries.some((e) => e.name === "Tenant A Özel")).toBe(false);
      // Diğer tenant'ın kendi Bas Gitar/Ukulele seed'i olur ama Tenant A'nınkiyle karışmaz.
      expect(otherTenantList.data.entries.some((e) => e.name === "Bas Gitar")).toBe(true);
    }

    const tenantAList = await listInstrumentCatalogTool(ctx(), {});
    expect(tenantAList.ok).toBe(true);
    if (tenantAList.ok) {
      expect(tenantAList.data.entries.some((e) => e.name === "Tenant A Özel")).toBe(true);
    }
  });
});

describe("ÖNCELİK 4 (devam) — enstrüman kataloğu → öğretmen formu UI wiring uçtan uca", () => {
  it("kataloğa özgü bir enstrüman (Bas Gitar) createTeacherTool ile başarıyla kaydedilir — yalnızca CSV'de değil, öğretmen formunda da", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Katalog Öğretmeni",
      email: "katalog@okul.com",
      phone: "5551234567",
      branchId: "erzene",
      instrument: "Piyano",
      instrumentLevels: [{ instrument: "Bas Gitar", level: "İleri" }],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    const teacher = data.teachers.find((t) => t.id === res.data.teacherId);
    expect(teacher?.instruments).toContain("Bas Gitar");
  });

  it("kataloğa hiç eklenmemiş/pasif bir enstrüman öğretmen formunda da reddedilir (yalnızca istemci enum'una güvenilmez)", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Hayali Enstrüman",
      email: "hayali@okul.com",
      phone: "5551234567",
      branchId: "erzene",
      instrument: "Piyano",
      instrumentLevels: [{ instrument: "Uzaylı Çalgısı", level: "İleri" }],
    });
    expect(res.ok).toBe(false);
  });
});
