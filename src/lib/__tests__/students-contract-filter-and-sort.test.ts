/**
 * D / H / I — Öğrenciler ekranı: sözleşme filtreleri, Türkçe sıralama ve
 * sayfa boyutu seçenekleri.
 *
 * Filtre/sıralama mantığı bilinçli olarak SAF fonksiyonlara ayrıldı
 * (`students-table.tsx` dışa aktarır) — bu repoda bileşen render testi
 * altyapısı yok (vitest `environment: "node"`), bu yüzden davranış
 * fonksiyon seviyesinde doğrulanır.
 */
import { describe, it, expect } from "vitest";
import {
  resolveContractFilterKey,
  compareStudents,
  CONTRACT_FILTER_KEYS,
  CONTRACT_FILTER_LABELS,
  type StudentRow,
} from "../../components/students-table";
import { PAGE_SIZE_OPTIONS, computePagination } from "../../components/pagination-controls";

const TODAY = "2026-09-20";

function row(over: Partial<StudentRow> = {}): StudentRow {
  return {
    id: "s1",
    name: "Ali",
    instruments: ["Piyano"],
    packageName: "Paket",
    monthlyFee: 1000,
    active: true,
    studentTypes: [],
    paymentStatus: "paid",
    ...over,
  };
}

describe("D — sözleşme durumu kategorileri", () => {
  it("sözleşmesi hiç olmayan öğrenci 'none'", () => {
    expect(resolveContractFilterKey(row(), TODAY)).toBe("none");
  });

  it("bitiş tarihi geçmiş sözleşme 'expired'", () => {
    const r = row({ contractNumber: "SZL-1", contractStatus: "generated", contractEndDate: "2026-09-19" });
    expect(resolveContractFilterKey(r, TODAY)).toBe("expired");
  });

  it("30 gün içinde bitecek sözleşme 'expiring'", () => {
    const r = row({ contractNumber: "SZL-1", contractStatus: "generated", contractEndDate: "2026-10-10" });
    expect(resolveContractFilterKey(r, TODAY)).toBe("expiring");
  });

  it("30 günden uzak sözleşme 'active'", () => {
    const r = row({ contractNumber: "SZL-1", contractStatus: "generated", contractEndDate: "2027-06-30" });
    expect(resolveContractFilterKey(r, TODAY)).toBe("active");
  });

  it("iptal/yenilenmiş sözleşme 'cancelled'", () => {
    expect(
      resolveContractFilterKey(
        row({ contractNumber: "SZL-1", contractStatus: "cancelled", contractEndDate: "2027-06-30" }),
        TODAY
      )
    ).toBe("cancelled");
    expect(
      resolveContractFilterKey(
        row({ contractNumber: "SZL-1", contractStatus: "superseded", contractEndDate: "2027-06-30" }),
        TODAY
      )
    ).toBe("cancelled");
  });

  it("tam olarak 30 gün sonrası hâlâ 'expiring' (sınır dahil)", () => {
    const r = row({ contractNumber: "SZL-1", contractStatus: "generated", contractEndDate: "2026-10-20" });
    expect(resolveContractFilterKey(r, TODAY)).toBe("expiring");
  });

  it("her kategori için Türkçe etiket vardır (ham kod ekranda GÖRÜNMEZ)", () => {
    for (const key of CONTRACT_FILTER_KEYS) {
      expect(CONTRACT_FILTER_LABELS[key]).toBeTruthy();
      expect(CONTRACT_FILTER_LABELS[key]).not.toBe(key);
    }
  });
});

describe("I — sıralama", () => {
  const ali = row({ id: "a", name: "Ali", createdAt: "2026-01-01", monthlyFee: 1000 });
  const cem = row({ id: "c", name: "Çetin", createdAt: "2026-03-01", monthlyFee: 3000 });
  const ilker = row({ id: "i", name: "İlker", createdAt: "2026-02-01", monthlyFee: 2000 });

  it("Türkçe alfabetik sıralama doğru (Ç ve İ yerinde)", () => {
    const sorted = [ilker, cem, ali].sort((x, y) => compareStudents(x, y, "name_asc")).map((r) => r.name);
    expect(sorted).toEqual(["Ali", "Çetin", "İlker"]);
  });

  it("isme göre azalan tam tersidir", () => {
    const sorted = [ali, cem, ilker].sort((x, y) => compareStudents(x, y, "name_desc")).map((r) => r.name);
    expect(sorted).toEqual(["İlker", "Çetin", "Ali"]);
  });

  it("oluşturulma tarihine göre yeniden eskiye", () => {
    const sorted = [ali, ilker, cem].sort((x, y) => compareStudents(x, y, "created_desc")).map((r) => r.id);
    expect(sorted).toEqual(["c", "i", "a"]);
  });

  it("sözleşme bitişine göre: sözleşmesi olmayanlar SONA düşer", () => {
    const withEnd = row({ id: "x", name: "X", contractEndDate: "2026-12-01" });
    const withoutEnd = row({ id: "y", name: "Y" });
    const sorted = [withoutEnd, withEnd].sort((a, b) => compareStudents(a, b, "contract_end_asc")).map((r) => r.id);
    expect(sorted).toEqual(["x", "y"]);
  });

  it("aylık ücrete göre yüksekten düşüğe", () => {
    const sorted = [ali, ilker, cem].sort((x, y) => compareStudents(x, y, "fee_desc")).map((r) => r.monthlyFee);
    expect(sorted).toEqual([3000, 2000, 1000]);
  });
});

describe("H — sayfa başına kayıt", () => {
  it("100 seçeneği mevcut", () => {
    expect([...PAGE_SIZE_OPTIONS]).toEqual([10, 20, 50, 100]);
  });

  it("100 seçilince ilk sayfada 100 kayıt gelir", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const page1 = computePagination(items, 1, 100);
    expect(page1.pageItems).toHaveLength(100);
    expect(page1.totalPages).toBe(3);
    const page3 = computePagination(items, 3, 100);
    expect(page3.pageItems).toHaveLength(50);
  });
});
