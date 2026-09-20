import { describe, it, expect } from "vitest";
import { parseCsv, rowsToRecords } from "../import/csv";
import { validateLessonScheduleRows } from "../import/lesson-schedule";
import { createSeedData } from "../seed";
import { addDays, format } from "date-fns";

const HEADER =
  "ogrenci,ogretmen,sube,enstruman,oda,baslangic_tarihi,bitis_tarihi,baslangic_saati,ders_suresi_dk,tekrar_tipi,tekrar_gunleri,tekrar_araligi,toplam_tekrar,notlar";

/**
 * Önümüzdeki bir SALI tarihini yyyy-MM-dd olarak döner.
 * 2026-09-20: Pazartesi Güz döneminin KAPALI günü olduğu için import da o
 * güne ders üretemez (çalışma günü tek kaynağı, src/lib/work-days.ts) —
 * testler içe aktarma mantığını sınadığı için açık bir gün kullanılır.
 */
function nextMonday(): string {
  const d = new Date();
  const diff = ((2 - d.getDay() + 7) % 7) || 7;
  return format(addDays(d, diff), "yyyy-MM-dd");
}

function preview(csv: string, data = createSeedData()) {
  const { records } = rowsToRecords(parseCsv(csv));
  return validateLessonScheduleRows(data, records);
}

describe("validateLessonScheduleRows — İş 1 tekrarlayan ders programı importu", () => {
  it("tekil ders satırı (tekrar_tipi boş) eski davranışla birebir çalışır — geriye dönük uyumluluk", () => {
    const data = createSeedData();
    const monday = nextMonday();
    const csv =
      HEADER +
      "\n" +
      `Zeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},,11:00,40,,,,,\n`;
    const result = preview(csv, data);
    expect(result.errorCount).toBe(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.kind).toBe("single");
    expect(result.summary.singleLessonRowCount).toBe(1);
    expect(result.summary.seriesRowCount).toBe(0);
  });

  it("eski kolon adları (tarih/saat/sure_dk) hâlâ okunur", () => {
    const data = createSeedData();
    const monday = nextMonday();
    const { records } = rowsToRecords(
      parseCsv(`ogrenci,ogretmen,sube,enstruman,oda,tarih,saat,sure_dk\nZeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},11:00,40\n`)
    );
    const result = validateLessonScheduleRows(data, records);
    expect(result.errorCount).toBe(0);
    expect(result.valid).toHaveLength(1);
  });

  it("haftalık tekrar eden bir seri doğru sayıda oluşum üretir", () => {
    const data = createSeedData();
    const monday = nextMonday();
    const endsOn = format(addDays(new Date(monday), 21), "yyyy-MM-dd"); // 4 hafta pencere
    const csv =
      HEADER +
      "\n" +
      `Zeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},${endsOn},11:00,40,weekly,Salı,1,,\n`;
    const result = preview(csv, data);
    expect(result.errorCount).toBe(0);
    expect(result.valid).toHaveLength(1);
    const plan = result.valid[0]!;
    expect(plan.kind).toBe("series");
    if (plan.kind !== "series") return;
    expect(plan.seriesParams).toHaveLength(1);
    expect(plan.occurrenceCount).toBe(4);
    expect(result.summary.totalLessonsToCreate).toBe(4);
  });

  it("haftada iki gün tekrar (tekrar_gunleri=Salı|Çarşamba) iki ayrı seri üretir", () => {
    const data = createSeedData();
    const monday = nextMonday();
    const endsOn = format(addDays(new Date(monday), 13), "yyyy-MM-dd"); // ~2 hafta
    const csv =
      HEADER +
      "\n" +
      `Zeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},${endsOn},11:00,40,weekly,Salı|Çarşamba,1,,\n`;
    const result = preview(csv, data);
    expect(result.errorCount).toBe(0);
    const plan = result.valid[0]!;
    expect(plan.kind).toBe("series");
    if (plan.kind !== "series") return;
    expect(plan.seriesParams).toHaveLength(2);
    expect(plan.seriesParams.map((p) => p.weekday).sort()).toEqual([2, 3]);
    // 2 haftalık pencerede her gün için 2 oluşum → toplam 4
    expect(plan.occurrenceCount).toBe(4);
  });

  it("öğretmen müsait olmadığı bir saatte hard error değil, warning üretir", () => {
    const data = createSeedData();
    // t1 Pazar (dayOfWeek 0) için hiç pencere bildirmemiş — bkz. seed.ts.
    const d = new Date();
    const sunday = format(addDays(d, ((7 - d.getDay()) % 7) || 7), "yyyy-MM-dd");
    const csv = HEADER + "\n" + `Zeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${sunday},,11:00,40,,,,,\n`;
    const result = preview(csv, data);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(1);
    const plan = result.valid[0]!;
    expect(plan.kind).toBe("single");
    if (plan.kind !== "single") return;
    expect(plan.availabilityWarning).toBe("TEACHER_UNAVAILABLE");
  });

  it("gerçek çakışma (TEACHER_CONFLICT) hard error olarak kalır, warning'e düşmez", () => {
    const data = createSeedData();
    const monday = nextMonday();
    const csv =
      HEADER +
      "\n" +
      `Zeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},,11:00,40,,,,,\n` +
      `Emir Çelik,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},,11:20,40,,,,,\n`;
    const result = preview(csv, data);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("başka bir dersi var"))).toBe(true);
  });

  it("aynı CSV iki kez önizlenirse (idempotency) ikinci geçişte satır duplicate işaretlenir", () => {
    const data = createSeedData();
    const monday = nextMonday();
    const csv = HEADER + "\n" + `Zeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},,11:00,40,,,,,\n`;
    const first = preview(csv, data);
    expect(first.valid[0]!.duplicate).toBe(false);

    // İlk satırı gerçekten "var olan veri" olarak simüle et, aynı CSV'yi TEKRAR önizle.
    const plan = first.valid[0]!;
    if (plan.kind !== "single") throw new Error("expected single");
    const dataAfter = {
      ...data,
      lessons: [
        ...data.lessons,
        {
          id: "l_test",
          studentId: plan.studentId,
          teacherId: plan.teacherId,
          roomId: plan.roomId,
          branchId: plan.branchId,
          instrument: plan.instrument,
          startAt: plan.startAt,
          endAt: plan.startAt,
          type: "regular" as const,
          status: "scheduled" as const,
        },
      ],
    };
    const second = preview(csv, dataAfter);
    expect(second.valid[0]!.duplicate).toBe(true);
  });

  it("bilinmeyen tekrar_tipi hard error verir", () => {
    const data = createSeedData();
    const monday = nextMonday();
    const csv =
      HEADER + "\n" + `Zeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},,11:00,40,gunluk,,,,\n`;
    const result = preview(csv, data);
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it("custom tekrar tipi henüz desteklenmiyor mesajıyla reddedilir (tahmin edilmez)", () => {
    const data = createSeedData();
    const monday = nextMonday();
    const csv =
      HEADER + "\n" + `Zeynep Arslan,Turgay Hoşbaş,Erzene,Piyano,Stüdyo 1 — Piyano,${monday},,11:00,40,custom,Salı,1,,\n`;
    const result = preview(csv, data);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("henüz desteklenmiyor"))).toBe(true);
  });
});
