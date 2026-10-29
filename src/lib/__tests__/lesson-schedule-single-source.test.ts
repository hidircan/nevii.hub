/**
 * K — Ders gün/saati TEK KAYNAK.
 *
 * KÖK NEDEN: Aynı bilgi üç yerde soruluyordu ve hiçbiri diğerini beslemiyordu.
 *   1. Yeni öğrenci kaydı — yalnız GÜN (checkbox), ilk tahsilatı hesaplıyor
 *      ama değeri HİÇBİR YERE yazmıyordu (`lessonDays: _ignoredLessonDays`).
 *   2. Sözleşme ekranı — gün + saat, serbest metin olarak yeniden soruluyordu.
 *   3. Ders Programı — seri üçüncü kez elle kuruluyordu.
 *
 * Artık: kayıt → `Student.lessonScheduleText` (kalıcı) → sözleşme ön-dolu +
 * dondurulmuş snapshot → sözleşmeden tek tıkla ders programı.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  composeLessonScheduleText,
  parseLessonScheduleText,
  lessonWeekdaysFromText,
  deriveLessonScheduleTextFromLessons,
} from "../lesson-schedule-text";

const ROOT = path.resolve(import.meta.dirname, "../../..");

describe("gün/saat metni tek biçimlendirici + tek ayrıştırıcı", () => {
  it("compose ve parse birbirinin tersidir", () => {
    const slots = [
      { weekday: 4, time: "16:00" },
      { weekday: 2, time: "15:00" },
    ];
    const text = composeLessonScheduleText(slots);
    expect(text).toBe("Salı 15:00, Perşembe 16:00");
    expect(parseLessonScheduleText(text)).toEqual([
      { weekday: 2, time: "15:00" },
      { weekday: 4, time: "16:00" },
    ]);
  });

  it("günler metinden türetilir — ayrı bir kullanıcı girişi YOK", () => {
    expect(lessonWeekdaysFromText("Salı 15:00, Perşembe 16:00")).toEqual([2, 4]);
    // Aynı gün iki saat → gün tekilleşir (haftalık sıklık doğrulaması bozulmaz).
    expect(lessonWeekdaysFromText("Salı 15:00, Salı 17:00")).toEqual([2]);
  });

  it("bozuk/eksik girdi sessizce atlanır, çökmez", () => {
    expect(parseLessonScheduleText("")).toEqual([]);
    expect(parseLessonScheduleText("Salı")).toEqual([]);
    expect(parseLessonScheduleText("Pazartesiiii 10:00")).toEqual([]);
    expect(parseLessonScheduleText("Salı 15:00, çöp")).toEqual([{ weekday: 2, time: "15:00" }]);
  });

  it("gerçek derslerden türetme KURUM SAAT DİLİMİNİ kullanır (3 saat kayma düzeltildi)", () => {
    // 2026-09-22T12:00:00Z = İstanbul'da Salı 15:00.
    const text = deriveLessonScheduleTextFromLessons([{ startAt: "2026-09-22T12:00:00.000Z" }]);
    expect(text).toBe("Salı 15:00");

    // Gece yarısına yakın ders: 2026-09-22T21:30:00Z = İstanbul'da ÇARŞAMBA 00:30.
    // Eski `getUTCDay()` + `toISOString()` bunu "Salı 21:30" gösteriyordu.
    expect(deriveLessonScheduleTextFromLessons([{ startAt: "2026-09-22T21:30:00.000Z" }])).toBe("Çarşamba 00:30");
  });

  it("iptal edilmiş dersler türetmeye dahil edilmez", () => {
    const text = deriveLessonScheduleTextFromLessons([
      { startAt: "2026-09-22T12:00:00.000Z" },
      { startAt: "2026-09-24T13:00:00.000Z", status: "cancelled" },
    ]);
    expect(text).toBe("Salı 15:00");
  });
});

describe("tekrarlı giriş kaldırıldı — veri gerçekten saklanıyor", () => {
  it("kayıt formu Sözleşme Merkezi ile AYNI bileşeni kullanır", () => {
    // Çoklu branş v2 (9500a0c): gün/saat her branş kartında ortak `EnrollmentFormFields` içinde seçilir
    // (kayıt formu → NewStudentEnrollments → EnrollmentFormFields → LessonScheduleSlotsPicker).
    const form = readFileSync(path.join(ROOT, "src/components/new-student-form.tsx"), "utf-8");
    const cards = readFileSync(path.join(ROOT, "src/components/new-student-enrollments.tsx"), "utf-8");
    const fields = readFileSync(path.join(ROOT, "src/components/enrollment-form-fields.tsx"), "utf-8");
    expect(form).toContain("NewStudentEnrollments");
    expect(cards).toContain("<EnrollmentFormFields");
    expect(fields).toContain("<LessonScheduleSlotsPicker");
    expect(fields).toContain("onChange({ lessonScheduleText: text })");
    // Ayrı bir `lessonDays` checkbox grubu geri gelmedi.
    expect(fields).not.toContain('name="lessonDays"');
    expect(form).not.toContain('type="checkbox"\n                    name="lessonDays"');
  });

  it("sunucu eylemi değeri öğrenci kaydına YAZAR", () => {
    const actions = readFileSync(path.join(ROOT, "src/lib/actions.ts"), "utf-8");
    expect(actions).toContain('lessonScheduleText: String(formData.get("lessonScheduleText") || "") || undefined');
  });

  it("Sözleşme Merkezi ön-doldurması ÖNCE kalıcı kaydı okur", () => {
    const page = readFileSync(
      path.join(ROOT, "src/app/panel/ogrenciler/[studentId]/sozlesmeler/page.tsx"),
      "utf-8"
    );
    // Çoklu branş v2: kalıcı kayıt seçilen branşın kaydıdır (`branchStudent`).
    expect(page).toContain("branchStudent.lessonScheduleText ||");
    expect(page).toContain("deriveLessonScheduleTextFromLessons");
  });

  it("sözleşme, gün/saati makine-okunur biçimde DONDURUR", () => {
    const contracts = readFileSync(path.join(ROOT, "src/lib/contracts.ts"), "utf-8");
    expect(contracts).toContain("lessonScheduleText: input.lessonScheduleText");
  });
});

describe("sözleşmeden ders programı üretimi — yaşam döngüsü", () => {
  const tools = readFileSync(path.join(ROOT, "src/lib/services/tools.ts"), "utf-8");

  it("varsayılan dryRun TRUE — önizleme görülmeden ders oluşmaz", () => {
    expect(tools).toContain("dryRun: z.boolean().default(true)");
  });

  it("gün/saat BURADA tekrar sorulmaz; sözleşmeden/öğrenciden okunur", () => {
    // Çoklu branş v2: öğrenci aynası yerine sözleşmenin branşının koşulu (yoksa öğrenci kaydı).
    expect(tools).toContain(
      "contract.contractDataSnapshot?.lessonScheduleText || (branchTerms ? branchTerms.lessonScheduleText : student.lessonScheduleText)"
    );
  });

  it("üretilen seri sözleşmeye bağlanır (izlenebilirlik)", () => {
    expect(tools).toContain("contractId: contract.id");
  });

  it("iptal edilmiş sözleşmeden ders üretilemez — Türkçe, nedeni açık hata", () => {
    expect(tools).toContain("İptal edilmiş bir sözleşmeden ders programı üretilemez");
  });

  it("gün/saat yoksa sessizce 0 ders üretmez, ne yapılacağını söyler", () => {
    expect(tools).toContain("Sözleşmede ders günü/saati kayıtlı değil");
  });

  it("sözleşme iptalinde dersler OTOMATİK SİLİNMEZ — yalnız sayılır", () => {
    expect(tools).toContain("export async function countContractLessonsTool");
    // Sayma tool'u hiçbir silme/iptal fonksiyonu çağırmaz.
    const fnStart = tools.indexOf("export async function countContractLessonsTool");
    const fnEnd = tools.indexOf("export async function", fnStart + 10);
    const body = tools.slice(fnStart, fnEnd);
    expect(body).not.toMatch(/cancelLesson|deleteLesson|removeLesson/);
  });
});
