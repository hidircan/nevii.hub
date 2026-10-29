import { describe, it, expect, beforeEach, vi } from "vitest";
import { promises as fs } from "fs";
import { addPanelNoteTool, deletePanelNoteTool, listPanelNotesTool, PANEL_NOTES_FILE, updatePanelNoteTool } from "../panel-notes";
import { CRIT, withTestCriticalPassword } from "./helpers/critical-delete";

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue({ id: "a", persisted: true }) }));
import type { ServiceContext } from "../services/context";

const ctx = (role: ServiceContext["role"], tenantId = "t1"): ServiceContext => ({ role, userId: `u-${role}`, tenantId, channel: "web" });

beforeEach(async () => {
  await fs.rm(PANEL_NOTES_FILE, { force: true });
});

describe("Günlük Özet notları (2026-10-05)", () => {
  it("yönetici not ekler; yazan ve zaman kaydedilir; en yeni önce; kurumlar ayrı", async () => {
    const a = await addPanelNoteTool(ctx("SCHOOL_ADMIN"), { body: "  Ali'nin velisi yarın arayacak  " });
    const b = await addPanelNoteTool(ctx("SUPER_ADMIN"), { body: "Oda 3 klima arızalı" });
    await addPanelNoteTool(ctx("SCHOOL_ADMIN", "t2"), { body: "başka kurum" });
    expect(a.ok && a.data.body).toBe("Ali'nin velisi yarın arayacak");
    expect(a.ok && a.data.createdByUserId).toBe("u-SCHOOL_ADMIN");
    expect(a.ok && a.data.createdByName.length).toBeGreaterThan(0);
    const list = await listPanelNotesTool(ctx("SCHOOL_ADMIN"));
    expect(list.ok && list.data.map((n) => n.id)).toEqual([b.ok && b.data.id, a.ok && a.data.id]);
  });

  it("boş/uzun not ve öğretmen/öğrenci reddedilir — anlaşılır Türkçe mesaj", async () => {
    const empty = await addPanelNoteTool(ctx("SCHOOL_ADMIN"), { body: "   " });
    expect(!empty.ok && empty.error.message).toContain("Not boş olamaz");
    const long = await addPanelNoteTool(ctx("SCHOOL_ADMIN"), { body: "x".repeat(2001) });
    expect(!long.ok && long.error.message).toContain("en fazla 2000");
    expect((await addPanelNoteTool(ctx("TEACHER"), { body: "x" })).ok).toBe(false);
    expect((await listPanelNotesTool(ctx("STUDENT"))).ok).toBe(false);
    // Notlar kurum genelidir; şube müdürü yalnız atandığı şubeyi görür (fail-closed).
    expect((await listPanelNotesTool(ctx("BRANCH_MANAGER"))).ok).toBe(false);
  });

  it("2026-10-06 — düzenleme ilk yazanı korur, son düzenleyeni gösterir; silme kritik şifre + gerekçe ister, not gizlenir", async () => {
    await withTestCriticalPassword("t1");
    const a = await addPanelNoteTool(ctx("SCHOOL_ADMIN"), { body: "Oda 3 klima arızalı" });
    const id = a.ok ? a.data.id : "";
    // Başka bir yönetici yazanın adına metni değiştiremez; yazan ve kurum sahibi düzenleyebilir.
    const other = await updatePanelNoteTool({ ...ctx("SCHOOL_ADMIN"), userId: "u-baska" }, { id, body: "uydurma" });
    expect(!other.ok && other.error.message).toContain("yalnız notu yazan");
    expect((await updatePanelNoteTool(ctx("SCHOOL_ADMIN"), { id, body: "Oda 3 klima arızalı (servis çağrıldı)" })).ok).toBe(true);
    const edited = await updatePanelNoteTool(ctx("SUPER_ADMIN"), { id, body: "Oda 3 klima tamir edildi" });
    expect(edited.ok && edited.data).toMatchObject({ body: "Oda 3 klima tamir edildi", createdByUserId: "u-SCHOOL_ADMIN" });
    expect(edited.ok && edited.data.updatedAt).toBeTruthy();
    const listed = await listPanelNotesTool(ctx("SCHOOL_ADMIN"));
    expect(listed.ok && listed.data[0]!.updatedAt).toBeTruthy();
    expect((await updatePanelNoteTool(ctx("SCHOOL_ADMIN"), { id, body: "  " })).ok).toBe(false);
    // Başka kurumun notu düzenlenemez/silinemez.
    expect((await updatePanelNoteTool(ctx("SCHOOL_ADMIN", "t2"), { id, body: "x" })).ok).toBe(false);
    const wrong = await deletePanelNoteTool(ctx("SCHOOL_ADMIN"), { id, criticalPassword: "yanlis", reason: CRIT.reason });
    expect(wrong.ok).toBe(false);
    const noReason = await deletePanelNoteTool(ctx("SCHOOL_ADMIN"), { id, criticalPassword: CRIT.criticalPassword, reason: "kısa" });
    expect(!noReason.ok && noReason.error.message).toContain("en az 5");
    expect((await deletePanelNoteTool(ctx("SCHOOL_ADMIN"), { id, ...CRIT })).ok).toBe(true);
    const after = await listPanelNotesTool(ctx("SCHOOL_ADMIN"));
    expect(after.ok && after.data.length).toBe(0);
    // Kayıt fiziksel olarak durur (gerekçe saklı).
    const raw = JSON.parse(await fs.readFile(PANEL_NOTES_FILE, "utf8")) as { id: string; deletionReason?: string }[];
    expect(raw.find((n) => n.id === id)?.deletionReason).toBe(CRIT.reason);
  });
});
