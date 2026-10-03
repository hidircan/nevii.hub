/**
 * 2026-10-03 (owner) — "Bas Gitar tanımlı ama oda oluşturmada görünmüyor". Kök neden: oda formu (ve 5 bileşen,
 * 3 içe aktarma) kurum kataloğu yerine sabit `INSTRUMENTS` listesini kullanıyordu; şube müdürü için katalog
 * aracı yetkisiz olduğunda sayfalar yine sabit yedeğe düşüyordu. Tek kaynak: kurumun AKTİF kataloğu.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs, readdirSync, readFileSync } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { createInstrumentCatalogTool, createRoomTool, updateInstrumentCatalogTool, updateRoomTool, listInstrumentCatalogTool } from "../services/tools";
import { clearInstrumentCatalog, resolveActiveInstrumentNames } from "../instrument-catalog";
import { activeInstrumentOptions } from "../instrument-options";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");
const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u1", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await clearInstrumentCatalog(DEFAULT_TENANT_ID);
});

async function setStatus(name: string, status: "active" | "archived") {
  const list = await listInstrumentCatalogTool(admin, {});
  if (!list.ok) throw new Error(list.error.message);
  const entry = list.data.entries.find((e) => e.name === name)!;
  const r = await updateInstrumentCatalogTool(admin, { entryId: entry.id, status });
  if (!r.ok) throw new Error(r.error.message);
}

describe("enstrüman seçenekleri — tek kaynak: kurumun aktif kataloğu", () => {
  it("Bas Gitar oda formu seçeneklerinde var; şube müdürü de aynı listeyi görür (sabit yedek yok)", async () => {
    const asAdmin = await activeInstrumentOptions(admin);
    expect(asAdmin).toContain("Bas Gitar");
    const branchManager: ServiceContext = { ...admin, role: "BRANCH_MANAGER" };
    const asBranchManager = await activeInstrumentOptions(branchManager);
    expect(asBranchManager).toEqual(asAdmin);
  });

  it("pasife alınan enstrüman yeni seçimde görünmez; kurum dışına sızmaz", async () => {
    await setStatus("Bas Gitar", "archived");
    expect(await activeInstrumentOptions(admin)).not.toContain("Bas Gitar");
    const added = await createInstrumentCatalogTool(admin, { name: "Kontrbas" });
    expect(added.ok).toBe(true);
    expect(await resolveActiveInstrumentNames(DEFAULT_TENANT_ID)).toContain("Kontrbas");
    expect(await resolveActiveInstrumentNames("tenant_baska_kurum")).not.toContain("Kontrbas");
  });
});

describe("oda kaydı sunucuda katalogla doğrulanır", () => {
  it("Bas Gitar'lı oda oluşur; ad kanonik yazıma çevrilir", async () => {
    const r = await createRoomTool(admin, { name: "Stüdyo Bas", branchId: "erzene", capacity: 2, instruments: ["bas gitar", "Gitar"] });
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    if (!r.ok) return;
    const room = (await readData()).rooms.find((x) => x.id === r.data.roomId)!;
    expect(room.instruments).toEqual(["Bas Gitar", "Gitar"]);
  });

  it("katalogda olmayan veya pasif enstrüman reddedilir; mesaj çözüm ekranını söyler", async () => {
    const unknown = await createRoomTool(admin, { name: "Stüdyo X", branchId: "erzene", capacity: 2, instruments: ["Theremin"] });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.message).toContain("Kurulum Merkezi › Enstrümanlar");
    await setStatus("Ukulele", "archived");
    const passive = await createRoomTool(admin, { name: "Stüdyo Y", branchId: "erzene", capacity: 2, instruments: ["Ukulele"] });
    expect(passive.ok).toBe(false);
  });

  it("düzenlemede odada zaten olan (sonradan pasife alınmış) enstrüman korunur, yeni pasif eklenemez", async () => {
    const created = await createRoomTool(admin, { name: "Stüdyo Z", branchId: "erzene", capacity: 2, instruments: ["Bas Gitar"] });
    if (!created.ok) throw new Error(created.error.message);
    await setStatus("Bas Gitar", "archived");
    await setStatus("Ukulele", "archived");
    const keep = await updateRoomTool(admin, { roomId: created.data.roomId, instruments: ["Bas Gitar", "Piyano"] });
    expect(keep.ok, keep.ok ? "" : keep.error.message).toBe(true);
    const addPassive = await updateRoomTool(admin, { roomId: created.data.roomId, instruments: ["Bas Gitar", "Ukulele"] });
    expect(addPassive.ok).toBe(false);
  });
});

describe("regresyon kilidi", () => {
  it("bileşenler sabit INSTRUMENTS listesini kullanmaz (seçenekler sayfadan, kurum kataloğundan gelir)", () => {
    const dir = path.resolve(import.meta.dirname, "../../components");
    const offenders = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /\bINSTRUMENTS\b/.test(readFileSync(path.join(dir, f), "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")));
    expect(offenders).toEqual([]);
  });
});
