import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

/**
 * Veli portalı güvenlik kilitleri (statik dosya taraması).
 *
 * Kapsam: SADECE Muse sahipliğindeki alanlar — `app/(parent)` route'ları ve
 * `src/features/parent`. Ortak dosyalar (student-scope, account, ui, api,
 * auth) Claude'un alanıdır; bu test onları taramaz.
 *
 * Kilitlenen kurallar:
 * 1) Veli ekranlarından ödeme/finans işlemi BAŞLATILAMAZ (read-only).
 * 2) Öğrenci ID'si istemcide tahmin edilmez — `students/...` URL'leri
 *    yalnız auth'tan gelen `studentId` bağlamından kurulur.
 * 3) Veli ekranında telefon numarası gösterilmez (gizlilik).
 */

const PARENT_APP_DIR = path.join(__dirname, "../../../../app/(parent)");
const PARENT_FEATURE_DIR = path.join(__dirname, "..");

async function walk(dir: string, exts: string[]): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      files.push(...(await walk(full, exts)));
    } else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
      files.push(full);
    }
  }
  return files;
}

async function readAll(dirs: string[]): Promise<Array<{ file: string; content: string }>> {
  const out: Array<{ file: string; content: string }> = [];
  for (const dir of dirs) {
    for (const file of await walk(dir, [".tsx", ".ts"])) {
      out.push({ file, content: await fs.readFile(file, "utf-8") });
    }
  }
  return out;
}

describe("veli portalı güvenlik kilitleri", () => {
  it("veli dosyalarından ödeme/finans/kurum işlemi başlatılamaz (read-only)", async () => {
    const files = await readAll([PARENT_APP_DIR, PARENT_FEATURE_DIR]);
    expect(files.length).toBeGreaterThan(0);
    const problems: string[] = [];
    // Kural yazma çağrısının HEDEFİNE bakar: kullanıcının kendi tercihleri
    // (communication-preference, notification-preferences, fotoğraf,
    // değerlendirme) meşrudur; ödeme/finans/kurum mutasyonları yasaktır.
    // Hedef URL yazma çağrısının (apiPost/apiDelete/apiPatch) string
    // argümanından çıkarılır.
    const callUrlPattern = /\bapi(?:Post|Delete|Patch)\(\s*[`'"]([^`'"]*)/g;
    const forbiddenTarget =
      /payments|balance|checkout|payout|payment-link|paymentLink|card-payment|absence-notices|follow-up|\/lessons|\/homework|\/attendance(?!-summary|\/month)|reassign|makeup/i;
    for (const { file, content } of files) {
      const rel = path.relative(PARENT_FEATURE_DIR, file);
      let match: RegExpExecArray | null;
      while ((match = callUrlPattern.exec(content)) !== null) {
        if (forbiddenTarget.test(match[1]!)) {
          problems.push(`${rel}: yasak hedefe yazma çağrısı \`${match[1]}\``);
        }
      }
      // Finans akışı anahtar kelimesi (endpoint adı dışında) geçmemeli.
      if (/checkout|payout|payment-link|paymentLink|card-payment/i.test(content)) {
        problems.push(`${rel}: finans akışı anahtar kelimesi bulundu`);
      }
    }
    expect(problems, `Veli alanında yasak yazma/finans çağrısı:\n${problems.join("\n")}`).toEqual([]);
  });

  it("students/ URL'leri yalnız auth studentId bağlamından kurulur (ID tahmini yok)", async () => {
    const files = await readAll([PARENT_APP_DIR, PARENT_FEATURE_DIR]);
    const problems: string[] = [];
    const urlPattern = /\/api\/v1\/students\/\$\{([^}]+)\}/g;
    for (const { file, content } of files) {
      let match: RegExpExecArray | null;
      while ((match = urlPattern.exec(content)) !== null) {
        const expr = match[1]!.trim();
        // İzinli: seçili bağlam (`useSelectedStudentId` — sunucu oturumundan
        // türetilir) ve legacy tekil auth bağlamı. URL parametresinden gelen
        // ID ile kurulan URL yasaktır.
        if (expr !== "studentId" && expr !== "user?.studentId" && expr !== "user.studentId") {
          problems.push(`${path.relative(PARENT_FEATURE_DIR, file)}: şüpheli ifade \`${expr}\``);
        }
      }
      // Sabit/hardcoded öğrenci ID'si (students/<literal>) asla olmamalı.
      const hardcoded = content.match(/\/api\/v1\/students\/[a-zA-Z0-9_-]{4,}(?![${/])/g);
      if (hardcoded) problems.push(`${path.relative(PARENT_FEATURE_DIR, file)}: hardcoded ID: ${hardcoded.join(", ")}`);
    }
    expect(problems, `ID tahmini şüphesi:\n${problems.join("\n")}`).toEqual([]);
  });

  it("veli ekranlarında telefon numarası gösterilmez", async () => {
    const files = await readAll([PARENT_FEATURE_DIR]);
    const problems: string[] = [];
    for (const { file, content } of files) {
      if (/\bparentPhone\b|\bphone\b/i.test(content)) {
        problems.push(path.relative(PARENT_FEATURE_DIR, file));
      }
    }
    expect(problems, `Telefon referansı bulunan veli dosyaları:\n${problems.join("\n")}`).toEqual([]);
  });

  it("guardian için teacher/admin operasyonu çağrısı yoktur", async () => {
    const files = await readAll([PARENT_APP_DIR, PARENT_FEATURE_DIR]);
    const problems: string[] = [];
    for (const { file, content } of files) {
      if (/take-attendance|grade-homework|assign-homework|lesson\/reassign|teacher\/payout|needsConfirmation/i.test(content)) {
        problems.push(path.relative(PARENT_FEATURE_DIR, file));
      }
    }
    expect(problems, `Guardian teacher/admin operasyonu şüphesi:\n${problems.join("\n")}`).toEqual([]);
  });

  it("çocuk seçimi sunucu-otritelidir — client üretimi ID ve URL-param otoritesi yoktur", async () => {
    const files = await readAll([PARENT_APP_DIR, PARENT_FEATURE_DIR]);
    const problems: string[] = [];
    for (const { file, content } of files) {
      const rel = path.relative(PARENT_FEATURE_DIR, file);
      // Seçim state'i yalnız paylaşılan sunucu-otriteli bağlamdan gelir.
      if (/setStudentId/i.test(content)) {
        problems.push(`${rel}: doğrudan studentId yazımı`);
      }
      // Route paramlarından öğrenci ID'si okunamaz (ders/ödev/ödeme
      // kaynak ID'leri hariç — onlar kaynak, kapsam değildir).
      const paramStudent = content.match(/useLocalSearchParams<\{[^}]*studentId[^}]*\}>/g);
      if (paramStudent) problems.push(`${rel}: param'dan studentId: ${paramStudent.join(", ")}`);
      // Sabit veli-çocuk eşleşmesi (hardcode) yasaktır.
      if (/childIds\s*=\s*\[/.test(content)) {
        problems.push(`${rel}: hardcoded çocuk listesi`);
      }
    }
    expect(problems, `Client-otriteli seçim şüphesi:\n${problems.join("\n")}`).toEqual([]);
  });
});
