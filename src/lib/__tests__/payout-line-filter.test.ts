import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  filterPayoutLines,
  payoutLineDayKey,
  payoutLineWeekday,
  sortPayoutLines,
  type FilterablePayoutLine,
  type FilterablePayoutLineSource,
} from "../payout-line-filter";
import { toDayKey } from "../teacher-payout";
import { computePagination, pageWindow } from "../../components/pagination-controls";

/**
 * Hakediş ders kalemleri: filtre + sıralama TÜM kümeye, sayfalama en son.
 * Saf fonksiyonlar doğrudan test edilir (component render altyapısı yok —
 * vitest `environment: "node"`, bkz. pagination-controls.test.ts).
 */

function line(over: Partial<FilterablePayoutLine> & { lessonId: string; lessonDate: string }): FilterablePayoutLine {
  return {
    studentName: "Öğrenci",
    branchName: "Kadıköy",
    instrument: "Piyano",
    durationMinutes: 40,
    amount: 100,
    ...over,
  };
}

function sources(entries: Record<string, FilterablePayoutLineSource>): Record<string, FilterablePayoutLineSource> {
  return entries;
}

describe("payoutLineDayKey — sunucu toDayKey ile birebir", () => {
  const cases = [
    "2026-09-15",
    "2026-09-15T00:00:00.000Z",
    "2026-09-15T14:00:00.000Z",
    "2026-09-30T22:30:00.000Z", // UTC 30 Eyl 22:30 = İstanbul 1 Eki 01:30
    "2026-09-15T10:00:00+03:00",
    "2026-09-15T14:00",
  ];
  for (const iso of cases) {
    it(`toDayKey ile aynı gün: ${iso}`, () => {
      expect(payoutLineDayKey(iso)).toBe(toDayKey(iso));
    });
  }
  it("UTC gece sınırı İstanbul gününe taşınır", () => {
    expect(payoutLineDayKey("2026-09-30T22:30:00.000Z")).toBe("2026-10-01");
  });
});

describe("payoutLineWeekday — İstanbul takvim günü (0=Pazar)", () => {
  it("bilinen günler", () => {
    expect(payoutLineWeekday("2026-10-25")).toBe(0); // Pazar
    expect(payoutLineWeekday("2026-10-26")).toBe(1); // Pazartesi
    expect(payoutLineWeekday("2026-10-24")).toBe(6); // Cumartesi
  });
  it("UTC günü değil İstanbul günü esas alınır", () => {
    // UTC Pazar 21:30 = İstanbul Pazartesi 00:30
    expect(payoutLineWeekday("2026-10-25T21:30:00.000Z")).toBe(1);
  });
});

describe("filterPayoutLines", () => {
  const lines = [
    line({ lessonId: "l1", lessonDate: "2026-09-05T10:00:00+03:00", studentName: "IŞIL Yılmaz", branchName: "Kadıköy", instrument: "Piyano" }),
    line({ lessonId: "l2", lessonDate: "2026-09-12T10:00:00+03:00", studentName: "Mehmet Demir", branchName: "Beşiktaş", instrument: "Gitar", issue: "duration-exception" }),
    line({ lessonId: "l3", lessonDate: "2026-09-20T10:00:00+03:00", studentName: "Ayşe Kaya", branchName: "Kadıköy", instrument: "Keman", issue: "missing-fee-rule", amount: 0 }),
    line({ lessonId: "l4", lessonDate: "2026-09-21T10:00:00+03:00", studentName: "Zeynep Arslan", branchName: "Kadıköy", instrument: "Piyano", original: { durationMinutes: 30, amount: 50 } }),
  ];
  const src = sources({
    l1: { state: "ok", attendanceLabel: "İşlendi", lessonType: "regular" },
    l2: { state: "ok", attendanceLabel: "Geldi", lessonType: "makeup" },
    l3: { state: "ok", attendanceLabel: "İşlendi", lessonType: "regular" },
    l4: { state: "ok", attendanceLabel: "Tamamlandı (Dersi bitir)", lessonType: "trial", excluded: true },
  });
  const ids = (criteria: Parameters<typeof filterPayoutLines>[2]) => filterPayoutLines(lines, src, criteria).map((l) => l.lessonId);

  it("boş kriterde tüm satırlar", () => {
    expect(ids({})).toEqual(["l1", "l2", "l3", "l4"]);
  });

  it("serbest arama Türkçe duyarsız eşleşir (I/ı)", () => {
    expect(ids({ query: "ışıl" })).toEqual(["l1"]);
    expect(ids({ query: "KADIKÖY" })).toEqual(["l1", "l3", "l4"]);
    expect(ids({ query: "gitar" })).toEqual(["l2"]);
  });

  it("tarih aralığı kapsayıcıdır", () => {
    expect(ids({ from: "2026-09-12", to: "2026-09-20" })).toEqual(["l2", "l3"]);
    expect(ids({ from: "2026-09-20" })).toEqual(["l3", "l4"]);
    expect(ids({ to: "2026-09-05" })).toEqual(["l1"]);
  });

  it("ters aralıkta sonuç yoktur", () => {
    expect(ids({ from: "2026-09-20", to: "2026-09-05" })).toEqual([]);
  });

  it("haftanın günü İstanbul gününe göre süzer", () => {
    // 2026-09-05 Cumartesi, 2026-09-12 Cumartesi, 2026-09-20 Pazar, 2026-09-21 Pazartesi
    expect(ids({ weekday: 6 })).toEqual(["l1", "l2"]);
    expect(ids({ weekday: 1 })).toEqual(["l4"]);
  });

  it("şube / branş / yoklama / ders türü tam eşleşir", () => {
    expect(ids({ branch: "Beşiktaş" })).toEqual(["l2"]);
    expect(ids({ instrument: "Keman" })).toEqual(["l3"]);
    expect(ids({ attendance: "Geldi" })).toEqual(["l2"]);
    expect(ids({ lessonType: "trial" })).toEqual(["l4"]);
  });

  it("durum filtresi", () => {
    expect(ids({ status: "duration-exception" })).toEqual(["l2"]);
    expect(ids({ status: "missing-fee-rule" })).toEqual(["l3"]);
    expect(ids({ status: "revised" })).toEqual(["l4"]);
    expect(ids({ status: "clean" })).toEqual(["l1"]);
  });

  it("yalnız istisnalılar TÜM kanonik sorunları kapsar", () => {
    expect(ids({ exceptionsOnly: true })).toEqual(["l2", "l3"]);
  });

  it("dahil/hariç durumu kaynak bayrağından okunur", () => {
    expect(ids({ excludeState: "excluded" })).toEqual(["l4"]);
    expect(ids({ excludeState: "included" })).toEqual(["l1", "l2", "l3"]);
  });

  it("filtreler birlikte (VE) çalışır", () => {
    expect(ids({ query: "kadıköy", status: "clean" })).toEqual(["l1"]);
    expect(ids({ branch: "Kadıköy", exceptionsOnly: true })).toEqual(["l3"]);
    expect(ids({ from: "2026-09-01", to: "2026-09-30", weekday: 0, lessonType: "regular" })).toEqual(["l3"]);
  });
});

describe("sortPayoutLines — kararlı, ID bağı", () => {
  it("tarih artan/azalan; eşit tarihte ders ID bağlar", () => {
    const rows = [
      line({ lessonId: "b", lessonDate: "2026-09-10T10:00:00+03:00" }),
      line({ lessonId: "a", lessonDate: "2026-09-10T10:00:00+03:00" }),
      line({ lessonId: "c", lessonDate: "2026-09-05T10:00:00+03:00" }),
    ];
    expect(sortPayoutLines(rows, "date-asc").map((l) => l.lessonId)).toEqual(["c", "a", "b"]);
    expect(sortPayoutLines(rows, "date-desc").map((l) => l.lessonId)).toEqual(["a", "b", "c"]);
  });

  it("öğrenci adı Türkçe sıralanır", () => {
    const rows = [
      line({ lessonId: "l1", lessonDate: "2026-09-01T10:00:00+03:00", studentName: "Demir" }),
      line({ lessonId: "l2", lessonDate: "2026-09-02T10:00:00+03:00", studentName: "Çetin" }),
      line({ lessonId: "l3", lessonDate: "2026-09-03T10:00:00+03:00", studentName: "Cem" }),
    ];
    expect(sortPayoutLines(rows, "student").map((l) => l.studentName)).toEqual(["Cem", "Çetin", "Demir"]);
  });

  it("süre ve tutar artan sıralanır", () => {
    const rows = [
      line({ lessonId: "l1", lessonDate: "2026-09-01T10:00:00+03:00", durationMinutes: 50, amount: 100 }),
      line({ lessonId: "l2", lessonDate: "2026-09-02T10:00:00+03:00", durationMinutes: 30, amount: 300 }),
    ];
    expect(sortPayoutLines(rows, "duration").map((l) => l.lessonId)).toEqual(["l2", "l1"]);
    expect(sortPayoutLines(rows, "amount").map((l) => l.lessonId)).toEqual(["l1", "l2"]);
  });

  it("girdi dizisini değiştirmez", () => {
    const rows = [
      line({ lessonId: "b", lessonDate: "2026-09-10T10:00:00+03:00" }),
      line({ lessonId: "a", lessonDate: "2026-09-05T10:00:00+03:00" }),
    ];
    sortPayoutLines(rows, "date-asc");
    expect(rows.map((l) => l.lessonId)).toEqual(["b", "a"]);
  });
});

describe("bileşim: filtre → sıralama (tüm küme) → sayfalama (en son)", () => {
  const rows: FilterablePayoutLine[] = Array.from({ length: 30 }, (_, i) =>
    line({
      lessonId: `l${String(i + 1).padStart(2, "0")}`,
      lessonDate: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00+03:00`,
      studentName: i % 2 === 0 ? "Ayşe" : "Mehmet",
      amount: (i + 1) * 10,
      issue: i % 5 === 0 ? "duration-exception" : undefined,
    })
  );
  const src: Record<string, FilterablePayoutLineSource> = {};

  it("sayfalar filtrelenmiş+sıralanmış kümenin kayıpsız/çift-siz bölümüdür", () => {
    const filtered = filterPayoutLines(rows, src, { query: "ayşe" });
    expect(filtered).toHaveLength(15);
    const sorted = sortPayoutLines(filtered, "amount");
    const p1 = computePagination(sorted, 1, 10);
    const p2 = computePagination(sorted, 2, 10);
    expect(p1.totalPages).toBe(2);
    expect([...p1.pageItems, ...p2.pageItems].map((l) => l.lessonId)).toEqual(sorted.map((l) => l.lessonId));
    // Tutarlar artan sırada sayfa sınırını aşar (yalnız sayfa içi sıralama yok).
    const amounts = [...p1.pageItems, ...p2.pageItems].map((l) => l.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  });

  it("filtre daralınca taşan sayfa son sayfaya kırpılır", () => {
    const filtered = filterPayoutLines(rows, src, { query: "mehmet", exceptionsOnly: true });
    const sorted = sortPayoutLines(filtered, "date-asc");
    const clamped = computePagination(sorted, 99, 10);
    expect(clamped.page).toBe(clamped.totalPages);
    expect(clamped.pageItems.length).toBeGreaterThan(0);
  });

  it("filtrelenen toplam yalnız filtrelenen satırlardan hesaplanır", () => {
    const filtered = filterPayoutLines(rows, src, { exceptionsOnly: true });
    const periodTotal = rows.reduce((s, l) => s + l.amount, 0);
    const filteredTotal = filtered.reduce((s, l) => s + l.amount, 0);
    expect(filtered).toHaveLength(6);
    expect(filteredTotal).toBeLessThan(periodTotal);
    expect(filteredTotal).toBe(10 + 60 + 110 + 160 + 210 + 260);
  });
});

describe("pageWindow — kısaltılmış doğrudan sayfa seçimi", () => {
  it("az sayfada kısaltma yok", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("başta: ilk blok + … + son", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, 6, "…", 20]);
  });

  it("ortada: ilk + … + pencere + … + son", () => {
    expect(pageWindow(10, 20)).toEqual([1, "…", 8, 9, 10, 11, 12, "…", 20]);
  });

  it("sonda: ilk + … + son blok", () => {
    expect(pageWindow(20, 20)).toEqual([1, "…", 15, 16, 17, 18, 19, 20]);
  });

  it("sayfa sınırları kırpılır", () => {
    expect(pageWindow(99, 20)).toEqual([1, "…", 15, 16, 17, 18, 19, 20]);
    expect(pageWindow(0, 20)).toEqual([1, 2, 3, 4, 5, 6, "…", 20]);
  });

  it("sayısal düğme sayısı sınırlıdır", () => {
    const numeric = pageWindow(50, 100).filter((e) => e !== "…");
    expect(numeric.length).toBeLessThanOrEqual(7);
  });
});

describe("TeacherPayoutDashboard — liste kontratları (statik)", () => {
  const source = readFileSync(path.join(process.cwd(), "src/components/teacher-payout-dashboard.tsx"), "utf8");

  it("ortak saf helper + paylaşımlı sayfalama kullanır (ikinci sistem yok)", () => {
    expect(source).toContain('from "@/lib/payout-line-filter"');
    expect(source).toContain('from "@/components/pagination-controls"');
    expect(source).toContain("filterPayoutLines(");
    expect(source).toContain("sortPayoutLines(");
    expect(source).toContain("usePagination(sortedLines, 25)");
  });

  it("sayfa boyutları 10/25/50/100, varsayılan 25", () => {
    expect(source).toContain("PAYOUT_PAGE_SIZES = [10, 25, 50, 100]");
    expect(source).toContain("pageSizeOptions={PAYOUT_PAGE_SIZES}");
  });

  it("revizyon taslağı TÜM satırlardan kurulur (yalnız görünen sayfadan değil)", () => {
    expect(source).toContain("for (const line of result.lines)");
  });

  it("dönem toplamı liste kontrollerinden bağımsızdır", () => {
    expect(source).toContain("existing?.totalAmount ?? result.totalAmount");
    expect(source).toContain("Filtrelenen sonuçların toplamı");
  });

  it("satır işlemleri ders ID ile çalışır", () => {
    expect(source).toContain("lessonId: line.lessonId");
    expect(source).toContain("key={line.lessonId}");
  });
});
