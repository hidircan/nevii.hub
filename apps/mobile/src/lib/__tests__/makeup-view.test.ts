import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { makeupStatusBadge, teacherMakeupItems } from "../makeup-view";
import type { MakeupRequest } from "../../types/api";

const m = (id: string, teacherId: string, status: string, createdAt: string): MakeupRequest => ({
  id,
  studentId: "s1",
  teacherId,
  sourceLessonId: "l1",
  status,
  reason: "Devamsızlık",
  expiresAt: "2026-10-01T00:00:00.000Z",
  createdAt,
  suggestedSlots: [],
});

describe("teacherMakeupItems", () => {
  it("başka öğretmenin kaydı UI'ya girmez (sunucu kapsamına ek savunma)", () => {
    const out = teacherMakeupItems([m("mine", "t1", "pending", "2026-09-01"), m("other", "t2", "pending", "2026-09-02")], "t1");
    expect(out.map((x) => x.id)).toEqual(["mine"]);
  });

  it("teacherId yoksa hiçbir kayıt gösterilmez (tahmin yok)", () => {
    expect(teacherMakeupItems([m("a", "t1", "pending", "2026-09-01")], undefined)).toEqual([]);
  });

  it("açık kayıtlar önce, sonra en yeni", () => {
    const out = teacherMakeupItems(
      [m("closedNew", "t1", "completed", "2026-09-05"), m("openOld", "t1", "pending", "2026-09-01"), m("openNew", "t1", "confirmed", "2026-09-03")],
      "t1"
    );
    expect(out.map((x) => x.id)).toEqual(["openNew", "openOld", "closedNew"]);
  });

  it("boş liste boş kalır (sahte kart yok)", () => {
    expect(teacherMakeupItems([], "t1")).toEqual([]);
  });
});

describe("makeupStatusBadge", () => {
  it("bilinen statüler Türkçe; bilinmeyen statü uydurulmadan aynen gösterilir", () => {
    expect(makeupStatusBadge("confirmed")).toEqual({ label: "Onaylandı", tone: "success" });
    expect(makeupStatusBadge("new_backend_status")).toEqual({ label: "new_backend_status", tone: "neutral" });
  });
});

describe("öğretmen telafi ekranı (app/(teacher)/telafi.tsx) — kaynak sözleşmesi", () => {
  const file = path.join(__dirname, "../../../app/(teacher)/telafi.tsx");
  const layout = path.join(__dirname, "../../../app/(teacher)/_layout.tsx");

  it("rota var ve öğretmen sekme grubunda kayıtlı", async () => {
    await expect(fs.access(file)).resolves.toBeUndefined();
    expect(await fs.readFile(layout, "utf8")).toMatch(/name="telafi"/);
  });

  it("salt-okunur: mutasyon çağrısı veya onay/iptal/oluşturma CTA'sı yok", async () => {
    const src = await fs.readFile(file, "utf8");
    expect(src).not.toMatch(/apiPost|apiPatch|apiDelete|\/makeup\/(confirm|cancel|create)/);
    expect(src).not.toMatch(/label="(Onayla|İptal et|Oluştur|Yeniden planla)"/);
  });

  it("veri yalnız useMakeupRequests'ten; FlatList + pull-to-refresh + ErrorState code; öğretmen filtresi uygulanır", async () => {
    const src = await fs.readFile(file, "utf8");
    expect(src).toMatch(/useMakeupRequests\(\)/);
    expect(src).toMatch(/<FlatList/);
    expect(src).toMatch(/RefreshControl/);
    expect(src).toMatch(/code=\{res\.code\}/);
    expect(src).toMatch(/teacherMakeupItems\(/);
    expect(src).toMatch(/EmptyState/);
    expect(src).toMatch(/LoadingSkeleton/);
  });
});
