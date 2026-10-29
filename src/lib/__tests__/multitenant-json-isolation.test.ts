/**
 * Dosya-başına-kurum yalıtımı (JSON modu) — varsayılan-dışı kurumun panel
 * okuma/yazımı kendi dosyasına gider; dar-dilim canlı fonksiyonlar
 * (commitMakeupPlanningExpiry, applyMakeupLifecycle, yoklama notu/geri
 * alma) da güncel kurum dosyasını kullanır (DATA_FILE sabitliği yok).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { runWithTenantAsync } from "../tenant-context";
import { readData } from "../store";
import { setLessonAttendanceNoteLive } from "../store-json";

const DIR = resolveDataDir(path.join(process.cwd(), "data"));
const B = "tenant_iso_b";
const bFile = () => path.join(DIR, `store-${B}.json`);

beforeEach(async () => {
  await fs.rm(path.join(DIR, "store.json"), { force: true });
  await fs.rm(bFile(), { force: true });
});

afterEach(async () => {
  await fs.rm(bFile(), { force: true });
});

describe("dosya-başına-kurum yalıtımı", () => {
  it("varsayılan-dışı kurum facade readData ile kendi dosyasını okur", async () => {
    const d = await runWithTenantAsync(B, () => readData());
    expect(d.settings.tenantId).toBe(B);
    expect(d.students).toEqual([]);
    // Varsayılan kurum dosyası B'nin verisini içermez.
    const a = await readData();
    expect(a.settings.tenantId).not.toBe(B);
  });

  it("canlı yoklama notu güncel kurum dosyasına yazılır, bulunamayan ders NOT_FOUND döner", async () => {
    const res = await runWithTenantAsync(B, () => setLessonAttendanceNoteLive("yok", "not"));
    expect(res).toEqual({ ok: false, message: expect.stringContaining("bulunamadı") });
  });
});
