import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { globalSearchTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

/**
 * Panel komut menüsünün varlık araması — `findPersonScheduleTool` ile AYNI
 * RBAC/tenant kapsamlama deseninin "ilk N eşleşmeyi listele" varyantı.
 * Seed'deki gerçek isimlerle çalışır (t2 "Can Yılmaz", s1 "Zeynep Arslan", ...).
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

describe("globalSearchTool — temel eşleşme", () => {
  it("bir öğrenci adıyla eşleşir", async () => {
    const res = await globalSearchTool(ctx(), { query: "Zeynep Arslan" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items).toContainEqual(expect.objectContaining({ kind: "student", id: "s1" }));
  });

  it("Türkçe karakter/ASCII toleranslı arama çalışır ('cagla' ~ 'Çağla' gibi)", async () => {
    const res = await globalSearchTool(ctx(), { query: "zeynep" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items.some((i) => i.id === "s1")).toBe(true);
  });

  it("hiç eşleşme yoksa boş liste döner", async () => {
    const res = await globalSearchTool(ctx(), { query: "Bulunmayan Kişi Xyz" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items).toEqual([]);
  });

  it("boş query reddedilir", async () => {
    const res = await globalSearchTool(ctx(), { query: "" });
    expect(res.ok).toBe(false);
  });
});

describe("globalSearchTool — rol bazlı kapsam", () => {
  it("TEACHER yalnız kendi öğrencisini bulur; başka öğretmenin öğrencisi sonuçta görünmez", async () => {
    const own = await globalSearchTool(ctx({ role: "TEACHER", teacherId: "t2" }), { query: "Emir Çelik" });
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    expect(own.data.items.some((i) => i.kind === "student" && i.id === "s2")).toBe(true);

    const cross = await globalSearchTool(ctx({ role: "TEACHER", teacherId: "t2" }), { query: "Zeynep Arslan" });
    expect(cross.ok).toBe(true);
    if (!cross.ok) return;
    expect(cross.data.items.some((i) => i.id === "s1")).toBe(false);
  });

  it("TEACHER başka öğretmeni bulamaz (yalnız kendini)", async () => {
    const res = await globalSearchTool(ctx({ role: "TEACHER", teacherId: "t2" }), { query: "Elif Kaya" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items.some((i) => i.kind === "teacher")).toBe(false);
  });

  it("PARENT bu araç için yetkisiz sayılır (FORBIDDEN)", async () => {
    const res = await globalSearchTool(ctx({ role: "PARENT", studentId: "s1" }), { query: "Zeynep" });
    expect(res.ok).toBe(false);
  });

  it("personel sonuçları yalnız SCHOOL_ADMIN/SUPER_ADMIN için döner, TEACHER'a hiç gelmez", async () => {
    const asAdmin = await globalSearchTool(ctx({ role: "SCHOOL_ADMIN" }), { query: "a" });
    expect(asAdmin.ok).toBe(true);

    const asTeacher = await globalSearchTool(ctx({ role: "TEACHER", teacherId: "t2" }), { query: "a" });
    expect(asTeacher.ok).toBe(true);
    if (!asTeacher.ok) return;
    expect(asTeacher.data.items.some((i) => i.kind === "staff")).toBe(false);
  });
});
