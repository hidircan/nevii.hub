import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

/**
 * 11. tur iş #11 — kalıcı regresyon tripwire (CI'da `npm test` ile koşar).
 *
 * Olay: sunucu `fieldErrors.birthDate` / `fieldErrors.nationalId` üretiyordu
 * ama kayıt formlarında render slotu YOKTU — kullanıcı "aşağıda işaretlendi"
 * görüyor, işaretli alan bulamıyordu.
 *
 * Bilinçli olarak DAVRANIŞ kilidi action testindedir
 * (`registration-identity-field-errors.test.ts`); burası yalnızca SÖZLEŞMEYİ
 * bekler: form, ilgili anahtarı EN AZ İKİ kez okumalıdır (aria-invalid +
 * FieldError slotu). 10. tur dersi gereği (`LESSONS_LEARNED.md` 2026-09-28
 * "statik kaynak-kilitli testler") BİREBİR JSX metni kilitlenmez — sayım,
 * yeniden biçimlendirmede kırılmaz; slotun kaldırılması KIRMIZI verir.
 * Yeni bir `fieldErrors.<alan>` anahtarı ekleyen, bu listedeki sayımı da
 * sağlamaktan sorumludur.
 */
const STUDENT_FORM = path.join(process.cwd(), "src/components/new-student-form.tsx");
const TEACHER_FORM = path.join(process.cwd(), "src/components/new-teacher-form.tsx");

function countOccurrences(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

describe("kayıt formu — sunucu alan-hatası slot paritesi (sayım)", () => {
  it("öğrenci formu birthDate anahtarını en az iki kez okur (işaret + mesaj)", async () => {
    const src = await fs.readFile(STUDENT_FORM, "utf8");
    expect(countOccurrences(src, "fieldErrors.birthDate")).toBeGreaterThanOrEqual(2);
  });

  it("öğrenci formu nationalId anahtarını en az iki kez okur (işaret + mesaj)", async () => {
    const src = await fs.readFile(STUDENT_FORM, "utf8");
    expect(countOccurrences(src, "fieldErrors.nationalId")).toBeGreaterThanOrEqual(2);
  });

  it("öğretmen formu nationalId anahtarını en az iki kez okur (kayıt-öncesi kapının hatası buraya düşer)", async () => {
    const src = await fs.readFile(TEACHER_FORM, "utf8");
    expect(countOccurrences(src, "fieldErrors.nationalId")).toBeGreaterThanOrEqual(2);
  });
});
