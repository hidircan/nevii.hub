import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

/**
 * Mobil ↔ backend route sözleşmesi: mobil kaynakta geçen her `/api/v1/...`
 * sabit yolunun backend'de (src/app/api/v1/** /route.ts) karşılığı olmalı —
 * yoksa ekran çalışma zamanında HTML 404 alır. Dinamik segmentler (`${id}`,
 * `:id`) her segmentle eşleşir. `+` ile birleştirilen ("/api/v1/x/" + id)
 * önekler atlanır. ponytail: HTTP metodu kontrol edilmez; gerekirse route
 * dosyasındaki `export const GET/POST` ile genişletilir.
 */
const MOBILE_ROOT = path.join(__dirname, "../../..");
const API_ROOT = path.join(MOBILE_ROOT, "../../src/app/api/v1");

/**
 * Backend'de route'u OLMAYAN, bilinen ve raporlanmış yollar (docs/mobile/MOBILE_P0_RECOVERY_MANIFEST.md §4.1).
 * Hiçbiri öğretmen portalında değil. Yeni eksik eklenmemeli; route gelince buradan silinmeli.
 */
const KNOWN_MISSING = new Set([
  // Yönetici mobil — post-launch (öğrenci/veli/öğretmen yollarının TAMAMI backend'de mevcut)
  "branches",
  "dashboard/summary",
  "homework/report",
  "instruments",
  "lessons",
  "lessons/:p/reassign",
  "rooms",
  "students/:p/documents",
  "students/:p/social-media-consent",
  "teachers/payouts/:p/mark-paid",
]);

async function walk(dir: string, pick: (name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") out.push(...(await walk(full, pick)));
    } else if (pick(e.name)) out.push(full);
  }
  return out;
}

async function backendRoutes(): Promise<string[][]> {
  const files = await walk(API_ROOT, (n) => n === "route.ts");
  return files.map((f) => path.relative(API_ROOT, path.dirname(f)).split(path.sep));
}

async function mobilePaths(): Promise<string[]> {
  const files = [
    ...(await walk(path.join(MOBILE_ROOT, "app"), (n) => /\.tsx?$/.test(n))),
    ...(await walk(path.join(MOBILE_ROOT, "src"), (n) => /\.tsx?$/.test(n))),
  ];
  const found = new Set<string>();
  for (const f of files) {
    const src = await fs.readFile(f, "utf8");
    for (const m of src.matchAll(/["`](\/api\/v1\/[^"`\s]*)["`]/g)) {
      const raw = m[1]!;
      if (raw.endsWith("/")) continue; // "/api/v1/x/" + id birleştirmesi
      found.add(raw.replace(/\$\{[^}]*\}/g, ":p").split("?")[0]!);
    }
  }
  return [...found].sort();
}

const isDynamic = (seg: string) => seg.includes(":") || /^\[.*\]$/.test(seg);

function matches(mobile: string[], route: string[]): boolean {
  return mobile.length === route.length && mobile.every((seg, i) => seg === route[i] || isDynamic(seg) || isDynamic(route[i]!));
}

describe("mobil API sözleşmesi", () => {
  it("mobildeki her /api/v1 yolu backend'de bir route.ts'e karşılık gelir", async () => {
    const routes = await backendRoutes();
    const missing: string[] = [];
    for (const p of await mobilePaths()) {
      const segs = p.replace(/^\/api\/v1\//, "").split("/");
      if (KNOWN_MISSING.has(segs.join("/"))) continue;
      if (!routes.some((r) => matches(segs, r))) missing.push(p);
    }
    expect(missing, `Backend'de karşılığı olmayan mobil yollar:\n${missing.join("\n")}`).toEqual([]);
  });

  it("KNOWN_MISSING listesi güncel (route eklendiyse listeden çıkarılmalı)", async () => {
    const routes = await backendRoutes();
    const nowPresent = [...KNOWN_MISSING].filter((p) => routes.some((r) => matches(p.split("/"), r)));
    expect(nowPresent).toEqual([]);
  });

  it("mobil P0 uç noktaları mevcut (session, makeup, receipt)", async () => {
    const routes = (await backendRoutes()).map((r) => r.join("/"));
    expect(routes).toEqual(expect.arrayContaining(["mobile/session", "makeup", "payments/[paymentId]/receipt"]));
  });

  it("backend'de domain'i olmayan absence-notices mobilde çağrılmıyor (stale çağrı kaldırıldı)", async () => {
    expect((await mobilePaths()).filter((p) => p.includes("absence-notices"))).toEqual([]);
  });
});
