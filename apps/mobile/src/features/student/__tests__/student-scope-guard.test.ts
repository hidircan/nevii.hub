import { describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import path from "path";

/**
 * Öğrenci portalı güvenlik kilitleri (statik dosya taraması).
 *
 * Kapsam: SADECE Muse sahipliğindeki alanlar — `app/(student)` route'ları ve
 * `src/features/student`. Ortak dosyalar (student-scope, account, ui, api,
 * auth) Claude'un alanıdır; bu test onları taramaz.
 *
 * Kilitlenen kurallar:
 * 1) Öğrenci route'ları thin-wrapper kalır; route dosyasında finans
 *    akışı (checkout/payout/payment-link) olmaz.
 * 2) `students/...` URL'leri yalnız auth'tan gelen `studentId` bağlamından
 *    kurulur — ID tahmini/URL uydurma yok.
 * 3) (student) grubunda öğretmen operasyonu (yoklama alma, ders düzenleme,
 *    not verme) çağrısı olmaz.
 */

const STUDENT_APP_DIR = path.join(__dirname, "../../../../app/(student)");
const STUDENT_FEATURE_DIR = path.join(__dirname, "..");

async function walk(dir: string, exts: string[]): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
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

describe("öğrenci portalı güvenlik kilitleri", () => {
  it("(student) route'larında finans akışı yoktur", async () => {
    const files = await readAll([STUDENT_APP_DIR, STUDENT_FEATURE_DIR]);
    expect(files.length).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const { file, content } of files) {
      if (/checkout|payout|payment-link|paymentLink|card-payment/i.test(content)) {
        problems.push(file);
      }
    }
    expect(problems, `Finans akışı şüphesi:\n${problems.join("\n")}`).toEqual([]);
  });

  it("students/ URL'leri yalnız auth studentId bağlamından kurulur", async () => {
    const files = await readAll([STUDENT_APP_DIR, STUDENT_FEATURE_DIR]);
    const problems: string[] = [];
    const urlPattern = /\/api\/v1\/students\/\$\{([^}]+)\}/g;
    for (const { file, content } of files) {
      let match: RegExpExecArray | null;
      while ((match = urlPattern.exec(content)) !== null) {
        const expr = match[1]!.trim();
        if (expr !== "studentId" && expr !== "user?.studentId" && expr !== "user.studentId") {
          problems.push(`${file}: şüpheli ifade \`${expr}\``);
        }
      }
      const hardcoded = content.match(/\/api\/v1\/students\/[a-zA-Z0-9_-]{4,}(?![${/])/g);
      if (hardcoded) problems.push(`${file}: hardcoded ID: ${hardcoded.join(", ")}`);
    }
    expect(problems, `ID tahmini şüphesi:\n${problems.join("\n")}`).toEqual([]);
  });

  it("öğrenci dosyalarında öğretmen operasyonu çağrısı yoktur", async () => {
    const files = await readAll([STUDENT_APP_DIR, STUDENT_FEATURE_DIR]);
    const problems: string[] = [];
    for (const { file, content } of files) {
      if (/take-attendance|grade-homework|assign-homework|lesson\/reassign|teacher\/payout/i.test(content)) {
        problems.push(file);
      }
    }
    expect(problems, `Öğretmen operasyonu şüphesi:\n${problems.join("\n")}`).toEqual([]);
  });
});
