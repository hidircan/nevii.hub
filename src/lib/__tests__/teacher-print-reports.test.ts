import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { createSeedData } from "../seed";
import { getTeacherPerformanceReportV2Tool, computeTeacherPayoutTool } from "../services/tools";
import type { ServiceContext } from "../services/context";
import { DEFAULT_TENANT_ID } from "../auth/config";

/**
 * P1 (2026-09-11) — öğretmen yazdırılabilir raporlar.
 * Uydurma hesaplama YOK: basılan, ekrandaki motorun AYNI çıktısıdır.
 * Yetki: performans = admin + yalnız kendisi; hakediş = yalnız admin
 * (öğretmen kendi hakediş çıktısına bu rotadan erişemez — bilinçli sınır).
 * Her iki rota da ortak `printSurfaceCss` mekanizmasını kullanır.
 */
const ROOT = path.resolve(import.meta.dirname, "../../..");
const PERF_SRC = readFileSync(path.join(ROOT, "src/app/ogretmen-performans-yazdir/[teacherId]/page.tsx"), "utf-8");
const PAYOUT_SRC = readFileSync(path.join(ROOT, "src/app/ogretmen-hakedis-yazdir/[teacherId]/page.tsx"), "utf-8");

function adminCtx(): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "user_owner_nilufer", tenantId: DEFAULT_TENANT_ID, channel: "web" };
}
function teacherCtx(teacherId: string): ServiceContext {
  return { role: "TEACHER", userId: `user_teacher_${teacherId}`, tenantId: DEFAULT_TENANT_ID, teacherId, channel: "web" };
}

describe("yazdırma rotaları — ortak print altyapısı", () => {
  it("her iki rota da printSurfaceCss + doc-print-surface + print:bg-white kullanır", () => {
    for (const src of [PERF_SRC, PAYOUT_SRC]) {
      expect(src).toContain("printSurfaceCss");
      expect(src).toContain("doc-print-surface");
      expect(src).toContain("print:bg-white");
      expect(src).not.toContain("print:bg-[var(--color-surface)]");
    }
  });

  it("sözleşme sayfasındaki Times kuralı bu rotalara sızmaz (yalnız sözleşme)", () => {
    for (const src of [PERF_SRC, PAYOUT_SRC]) {
      expect(src).not.toContain("Times New Roman");
    }
  });

  it("ekranlardan 'Yazdır / PDF' bağlantısı var", () => {
    const perfPage = readFileSync(
      path.join(ROOT, "src/app/panel/ogretmenler/[teacherId]/performans/page.tsx"),
      "utf-8"
    );
    const payoutPage = readFileSync(
      path.join(ROOT, "src/components/teacher-payout-dashboard.tsx"),
      "utf-8"
    );
    expect(perfPage).toContain("/ogretmen-performans-yazdir/");
    expect(payoutPage).toContain("/ogretmen-hakedis-yazdir/");
  });
});

describe("performans raporu — yetki ve gerçek veri", () => {
  it("öğretmen BAŞKA öğretmenin raporunu göremez (FORBIDDEN)", async () => {
    const data = createSeedData();
    const other = data.teachers.find((t) => t.id !== "t1");
    if (!other) throw new Error("seed ikinci öğretmen yok");
    const res = await getTeacherPerformanceReportV2Tool(teacherCtx("t1"), {
      teacherId: other.id,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(res.ok).toBe(false);
  });

  it("öğretmen KENDİ raporunu görebilir; skor null ya da 0-100 (uydurma yok)", async () => {
    const res = await getTeacherPerformanceReportV2Tool(teacherCtx("t1"), {
      teacherId: "t1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.score === null || (res.data.score >= 0 && res.data.score <= 100)).toBe(true);
    expect(res.data.teacherId).toBe("t1");
  });

  it("admin raporu okuyabilir", async () => {
    const res = await getTeacherPerformanceReportV2Tool(adminCtx(), {
      teacherId: "t1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(res.ok).toBe(true);
  });
});

describe("hakediş raporu — yetki ve gerçek veri", () => {
  it("öğretmen (kendi dahil) hakediş motoruna erişemez (FORBIDDEN)", async () => {
    const res = await computeTeacherPayoutTool(teacherCtx("t1"), {
      teacherId: "t1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(res.ok).toBe(false);
  });

  it("admin hakedişi gerçek ders satırlarından hesaplar; brüt/net ayrımı YOKTUR", async () => {
    const res = await computeTeacherPayoutTool(adminCtx(), {
      teacherId: "t1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Array.isArray(res.data.lines)).toBe(true);
    expect(typeof res.data.totalAmount).toBe("number");
    // Tek tutar modeli — brüt/net/indirim/kesinti alanı yoktur.
    expect("grossAmount" in res.data).toBe(false);
    expect("netAmount" in res.data).toBe(false);
    const recomputed = res.data.lines.reduce((s, l) => s + l.amount, 0);
    expect(Math.abs(recomputed - res.data.totalAmount) < 0.011).toBe(true);
  });
});
