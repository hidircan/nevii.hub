import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { readFileSync } from "fs";
import { resolveDataDir } from "../config";
import { createBranchTool, previewTeacherImportTool, commitTeacherImportTool } from "../services/tools";
import { readData } from "../store";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { clearInstrumentCatalog, resolveActiveInstrumentNames } from "../instrument-catalog";
import type { ServiceContext } from "../services/context";
import { runWithTenantAsync } from "../tenant-context";

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

// OgretmenlerPage artık requireSessionContext() + kurum kapsamı (cookies())
// okur — bu test sayfayı gerçek bir HTTP isteği olmadan doğrudan çağırdığından
// ikisini de burada sahteler. Kurum cookie'si yokmuş gibi davranmak,
// SCHOOL_ADMIN'in varsayılan olarak kendi kurumuna (DEFAULT_TENANT_ID) düşmesi
// anlamına gelir — testin ALS ile zaten kurduğu kapsamla birebir uyumludur.
vi.mock("@/lib/auth/session", () => ({
  requireSessionContext: async () => ctx(),
  getSessionContext: async () => ctx(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

const { default: OgretmenlerPage } = await import("../../app/panel/ogretmenler/page");

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
  await clearInstrumentCatalog(DEFAULT_TENANT_ID);
  await resolveActiveInstrumentNames(DEFAULT_TENANT_ID);
});

afterEach(async () => {
  await clearInstrumentCatalog(DEFAULT_TENANT_ID);
});

const HEADER = "ad,eposta,telefon,sube,enstruman";
// Not: kullanıcının orijinal CSV'sinde enstrüman "Bağlama" idi — bu uygulamanın
// desteklediği enstrüman listesinde (Piyano, Yan Flüt, Gitar, Bateri, Keman,
// Şan) YOK. Bu, parser hatasından tamamen ayrı, gerçek bir bulgu; burada
// "mutlu yol" (4/4 geçerli) senaryosunu temiz göstermek için geçerli bir
// enstrüman (Gitar) kullanılıyor. Kullanıcının orijinal "Bağlama" içeren
// CSV'si ayrı bir testte, dürüst (kısmi) sonucuyla doğrulanıyor.
const DATA_LINES = [
  "Selin Kara,selin@okul.com,05551111111,Erzene,Piyano",
  "Hıdırcan Yağız,hidircanyagiz@gmail.com,05336185006,Bostanlı,Gitar",
  "Ezgi Güçlü,ezguclu@gmail.com,05521800268,Bostanlı,Piyano",
  "Can Nevii,cannevii@gmail.com,05336185007,Bostanlı,Keman",
];
const EXPECTED_NAMES = ["Selin Kara", "Hıdırcan Yağız", "Ezgi Güçlü", "Can Nevii"];

function buildCsv(eol: string): string {
  return [HEADER, ...DATA_LINES].join(eol) + eol;
}

/** React element ağacından tüm string yaprakları çıkarır — render katmanı olmadan sayfa çıktısını doğrulamak için. */
function extractText(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => extractText(child, out));
    return out;
  }
  if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
    const props = (node as { props?: { children?: unknown; cards?: Record<string, unknown> } }).props;
    if (props && "children" in props) extractText(props.children, out);
    // 8. tur — öğretmen kartları `TeacherListView`'a `cards` prop'u ile sunucuda çizilip verilir.
    if (props?.cards) extractText(Object.values(props.cards), out);
  }
  return out;
}

describe("Kritik hata: 4 satırlı öğretmen CSV'si — kök neden regresyonu", () => {
  it("Bostanlı yokken: totalRows=4, validCount=1, errorCount=3; commit tamamen engellenir, hiçbir kayıt yazılmaz", async () => {
    const before = await readData();
    const beforeCount = before.teachers.length;

    const csv = buildCsv("\n");
    const preview = await previewTeacherImportTool(ctx(), { csvText: csv });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.totalRows).toBe(4);
    expect(preview.data.validCount).toBe(1);
    expect(preview.data.errorCount).toBe(3);

    const commit = await commitTeacherImportTool(ctx(), { csvText: csv });
    expect(commit.ok).toBe(false);
    if (!commit.ok) expect(commit.error.code).toBe("VALIDATION_ERROR");

    const after = await readData();
    expect(after.teachers.length).toBe(beforeCount);
  });

  it.each([
    ["LF (\\n)", "\n"],
    ["CRLF (\\r\\n)", "\r\n"],
    ["tek başına CR (\\r) — orijinal hatanın kök nedeni", "\r"],
  ])("Bostanlı oluşturulduktan sonra %s satır sonlu CSV: 4 satırın tamamı doğru okunur ve aktarılır", async (_label, eol) => {
    const branchRes = await createBranchTool(ctx(), {
      name: "Bostanlı Şubesi",
      shortName: "Bostanlı",
      city: "İzmir",
      phone: "0555 000 0000",
      address: "Bostanlı Mah. No:1",
    });
    expect(branchRes.ok).toBe(true);

    const csv = buildCsv(eol);

    const preview = await previewTeacherImportTool(ctx(), { csvText: csv });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.totalRows).toBe(4);
    expect(preview.data.validCount).toBe(4);
    expect(preview.data.errorCount).toBe(0);
    expect(preview.data.readRows).toHaveLength(4);

    const commit = await commitTeacherImportTool(ctx(), { csvText: csv });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.data.created).toBe(4);
    expect(commit.data.updated).toBe(0);

    const data = await readData();
    for (const name of EXPECTED_NAMES) {
      expect(data.teachers.some((t) => t.name === name)).toBe(true);
    }

    // Aynı dosyanın ikinci kez aktarımı: duplicate üretmemeli, günceller.
    const secondCommit = await commitTeacherImportTool(ctx(), { csvText: csv });
    expect(secondCommit.ok).toBe(true);
    if (!secondCommit.ok) return;
    expect(secondCommit.data.created).toBe(0);
    expect(secondCommit.data.updated).toBe(4);

    const afterSecond = await readData();
    for (const name of EXPECTED_NAMES) {
      expect(afterSecond.teachers.filter((t) => t.name === name)).toHaveLength(1);
    }
  });

  it("uçtan uca: Bostanlı + 4 satır aktarıldıktan sonra /panel/ogretmenler sayfası dört öğretmenin dördünü de gösterir", async () => {
    const branchRes = await createBranchTool(ctx(), {
      name: "Bostanlı Şubesi",
      shortName: "Bostanlı",
      city: "İzmir",
      phone: "0555 000 0000",
      address: "Bostanlı Mah. No:1",
    });
    expect(branchRes.ok).toBe(true);

    const commit = await commitTeacherImportTool(ctx(), { csvText: buildCsv("\n") });
    expect(commit.ok).toBe(true);
    if (!commit.ok) return;
    expect(commit.data.created).toBe(4);

    const element = await runWithTenantAsync(DEFAULT_TENANT_ID, () => OgretmenlerPage());
    const texts = extractText(element).join(" ");
    for (const name of EXPECTED_NAMES) {
      expect(texts, `"${name}" öğretmen listesinde görünmüyor`).toContain(name);
    }
  });

  it("kullanıcının orijinal CSV'si ('Bağlama' enstrümanıyla): dört satır doğru okunur ve etkin katalog enstrümanı olarak kabul edilir", async () => {
    const branchRes = await createBranchTool(ctx(), {
      name: "Bostanlı Şubesi",
      shortName: "Bostanlı",
      city: "İzmir",
      phone: "0555 000 0000",
      address: "Bostanlı Mah. No:1",
    });
    expect(branchRes.ok).toBe(true);

    const originalCsv = [
      HEADER,
      "Selin Kara,selin@okul.com,05551111111,Erzene,Piyano",
      "Hıdırcan Yağız,hidircanyagiz@gmail.com,05336185006,Bostanlı,Bağlama",
      "Ezgi Güçlü,ezguclu@gmail.com,05521800268,Bostanlı,Piyano",
      "Can Nevii,cannevii@gmail.com,05336185007,Bostanlı,Bağlama",
    ].join("\n") + "\n";

    const preview = await previewTeacherImportTool(ctx(), { csvText: originalCsv });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    // Satır sayısı artık doğru okunuyor (kök neden düzeltmesi) — 4 satırın
    // hepsi görülüyor, sadece "Bağlama" gerçekten desteklenmediği için hata alıyor.
    expect(preview.data.totalRows).toBe(4);
    expect(preview.data.readRows).toHaveLength(4);
    expect(preview.data.validCount).toBe(4);
    expect(preview.data.errorCount).toBe(0);
    expect(preview.data.errors).toEqual([]);
  });

  it("Veri Aktarım Merkezi'nde öğretmen başarı linki /panel/ogretmenler'e gider", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/panel/veri-aktar/page.tsx"),
      "utf-8"
    );
    const teacherSectionIndex = source.indexOf("Öğretmenler");
    expect(teacherSectionIndex).toBeGreaterThan(-1);
    const nearbySlice = source.slice(teacherSectionIndex, teacherSectionIndex + 600);
    expect(nearbySlice).toContain('successHref="/panel/ogretmenler"');
  });
});
