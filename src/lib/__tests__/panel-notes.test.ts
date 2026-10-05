import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import { addPanelNoteTool, listPanelNotesTool, PANEL_NOTES_FILE } from "../panel-notes";
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
});
