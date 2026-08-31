import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { findPersonScheduleTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";
import { STUDENT_PORTAL_ACCESS_FILE } from "../student-portal-access";
import { grantStudentAccess } from "./portal-access-test-helper";

/**
 * "when is Can's lesson" / "Ayşe öğretmenin programı" resolution — the one
 * new read-only tool added so the global AI assistant can answer questions
 * about a person by NAME instead of requiring an id. Mirrors the seeded demo
 * data's real names (t2 "Olcay Özdemir", s1 "Zeynep Arslan", ...).
 *
 * Not (2026-08-31 test düzeltmesi): t2 önceden "Can Yılmaz" idi; seed.ts'deki
 * öğretmen listesi yeniden düzenlendiğinde isim/id eşleşmesi değişti ("Can
 * Yılmaz" artık seed'de hiç yok). Bu dosyadaki sorgular güncel isme taşındı.
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
  await fs.rm(STUDENT_PORTAL_ACCESS_FILE, { force: true });
});

describe("findPersonScheduleTool — tek eşleşme", () => {
  it("bir öğretmen adıyla tek eşleşince matchType:'teacher' + upcomingLessons döner", async () => {
    const res = await findPersonScheduleTool(ctx(), { query: "Olcay Özdemir" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ matchType: "teacher", id: "t2", name: "Olcay Özdemir" });
    if (res.data.matchType === "teacher") {
      expect(Array.isArray(res.data.upcomingLessons)).toBe(true);
    }
  });

  it("bir öğrenci adıyla tek eşleşince matchType:'student' döner", async () => {
    const res = await findPersonScheduleTool(ctx(), { query: "Zeynep Arslan" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ matchType: "student", id: "s1", name: "Zeynep Arslan" });
  });

  it("kısmi/case-insensitive eşleşme de çalışır", async () => {
    const res = await findPersonScheduleTool(ctx(), { query: "zeynep" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ matchType: "student", id: "s1" });
  });
});

describe("findPersonScheduleTool — eşleşme yok / belirsiz", () => {
  it("hiç kimse eşleşmezse matchType:'none' döner", async () => {
    const res = await findPersonScheduleTool(ctx(), { query: "Bulunmayan Kişi Xyz" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ matchType: "none", query: "Bulunmayan Kişi Xyz" });
  });

  it("birden fazla kişi eşleşirse matchType:'ambiguous' + adaylar listesi döner", async () => {
    // "de" alt dizesi seed'de birden fazla isimde geçiyor (Ayşe Demir,
    // İpek Demirtaş, Defne Şahin) — tam sayıyı değil, belirsizlik davranışını
    // doğrular (seed büyüse bile kırılgan olmasın diye >=2 ile sınırlı).
    const res = await findPersonScheduleTool(ctx(), { query: "de" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.matchType).toBe("ambiguous");
    if (res.data.matchType === "ambiguous") {
      expect(res.data.candidates.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("findPersonScheduleTool — rol bazlı erişim kapsamı (canAccessStudent/canAccessTeacher ile aynı)", () => {
  it("veli (STUDENT rolü) yalnızca KENDİ çocuğunu bulur — başka bir öğrenciyi tam adıyla arasa bile 'none' döner", async () => {
    const parentCtx = ctx({ role: "STUDENT", studentId: "s1" });
    await grantStudentAccess(parentCtx, "s1", "GUARDIAN");
    const res = await findPersonScheduleTool(
      parentCtx,
      { query: "Emir Çelik" } // s2 — başka bir öğrenci
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.matchType).toBe("none");
  });

  it("veli (STUDENT rolü, GUARDIAN erişimi) kendi çocuğunu adıyla bulabilir", async () => {
    const parentCtx = ctx({ role: "STUDENT", studentId: "s1" });
    await grantStudentAccess(parentCtx, "s1", "GUARDIAN");
    const res = await findPersonScheduleTool(parentCtx, {
      query: "Zeynep Arslan",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toMatchObject({ matchType: "student", id: "s1" });
  });

  it("TEACHER başka bir öğretmeni adıyla bulamaz (yalnız kendi teacherId'si eşleşir)", async () => {
    const res = await findPersonScheduleTool(
      ctx({ role: "TEACHER", teacherId: "t2" }),
      { query: "Elif Kaya" } // t3 — başka bir öğretmen
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.matchType).toBe("none");
  });

  it("TEACHER yalnız kendi öğrencisini adıyla bulur; başka öğretmenin öğrencisi none", async () => {
    const cross = await findPersonScheduleTool(ctx({ role: "TEACHER", teacherId: "t2" }), {
      query: "Zeynep Arslan", // s1 → t1
    });
    expect(cross.ok).toBe(true);
    if (!cross.ok) return;
    expect(cross.data.matchType).toBe("none");

    const own = await findPersonScheduleTool(ctx({ role: "TEACHER", teacherId: "t2" }), {
      query: "Emir Çelik", // s2 → t2
    });
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    expect(own.data).toMatchObject({ matchType: "student", id: "s2" });
  });
});

describe("findPersonScheduleTool — girdi doğrulama", () => {
  it("boş query reddedilir", async () => {
    const res = await findPersonScheduleTool(ctx(), { query: "" });
    expect(res.ok).toBe(false);
  });
});
