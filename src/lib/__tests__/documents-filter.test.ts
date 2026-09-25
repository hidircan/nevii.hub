/** UAT 2026-09-25 (Öncelik 4) — Evraklar Merkezi filtreleri birlikte çalışır; pasif öğrenci evrakı erişilebilir. */
import { describe, it, expect } from "vitest";
import { filterAndSortDocuments, type DocumentFilters, type DocumentFilterRow } from "../documents-filter";
import { computePagination } from "@/components/pagination-controls";

const base: DocumentFilters = {
  query: "",
  kinds: [],
  statuses: [],
  branches: [],
  from: "",
  to: "",
  studentState: "all",
  sortKey: "createdAt",
  sortDir: "desc",
};
const rows: (DocumentFilterRow & { id: string })[] = [
  { id: "1", reference: "EVR-1", kindLabel: "Sözleşme", personName: "Ali", status: "issued", createdAt: "2026-09-01", branchName: "Erzene", studentActive: true },
  { id: "2", reference: "EVR-2", kindLabel: "KVKK", personName: "Buse", parentName: "Selin", status: "signed", createdAt: "2026-09-10", branchName: "Evka 3", studentActive: false },
  { id: "3", reference: "EVR-3", kindLabel: "Sözleşme", personName: "Can", status: "cancelled", createdAt: "2026-09-20", branchName: "Erzene", studentActive: false },
  { id: "4", reference: "EVR-4", kindLabel: "Personel", personName: "Öğretmen Ece", status: "uploaded", createdAt: "2026-08-15" },
];

describe("filterAndSortDocuments", () => {
  it("varsayılan: aktif + pasif + öğrenci dışı tüm evraklar, en yeni önce", () => {
    expect(filterAndSortDocuments(rows, base).map((r) => r.id)).toEqual(["3", "2", "1", "4"]);
  });
  it("yalnız pasif öğrenci evrakları", () => {
    expect(filterAndSortDocuments(rows, { ...base, studentState: "inactive" }).map((r) => r.id)).toEqual(["3", "2"]);
  });
  it("yalnız aktif öğrenci evrakları (öğrenci dışı evrak hariç)", () => {
    expect(filterAndSortDocuments(rows, { ...base, studentState: "active" }).map((r) => r.id)).toEqual(["1"]);
  });
  it("tür + şube + tarih + pasif birlikte", () => {
    const r = filterAndSortDocuments(rows, { ...base, kinds: ["Sözleşme"], branches: ["Erzene"], from: "2026-09-05", studentState: "inactive" });
    expect(r.map((x) => x.id)).toEqual(["3"]);
  });
  it("veli adıyla arama (Türkçe büyük/küçük harf)", () => {
    expect(filterAndSortDocuments(rows, { ...base, query: "SELİN" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("kişiye göre A→Z sıralama", () => {
    expect(filterAndSortDocuments(rows, { ...base, sortKey: "personName", sortDir: "asc" }).map((r) => r.personName)).toEqual([
      "Ali",
      "Buse",
      "Can",
      "Öğretmen Ece",
    ]);
  });
});

describe("sayfalama boş sayfa göstermez", () => {
  it("filtre listeyi küçültünce geçerli sayfa son sayfaya kırpılır", () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    expect(computePagination(items, 3, 20).pageItems).toHaveLength(5);
    const afterFilter = computePagination(items.slice(0, 7), 3, 20);
    expect(afterFilter.page).toBe(1);
    expect(afterFilter.pageItems).toHaveLength(7);
  });
});
