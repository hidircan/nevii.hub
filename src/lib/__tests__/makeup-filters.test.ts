import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  filterMakeupRequests,
  filtersForBranchChange,
  makeupFilterHref,
  makeupStudentOptions,
  makeupTeacherOptions,
  optionsForBranch,
  parseMakeupFilters,
  EMPTY_MAKEUP_FILTERS,
} from "../makeup-filters";
import { searchMakeupStudents } from "../../components/makeup-filter-bar";
import { MakeupSuggestionsDisclosure, suggestionsToggleLabel } from "../../components/makeup-suggestions-disclosure";
import {
  activeTeachersForBranch,
  filterLessonsForCalendar,
  studentFilterOptions,
} from "../../components/program-studio";
import type { Lesson, MakeupRequest, Student, Teacher } from "../types";

const student = (o: Partial<Student>) =>
  ({ id: "s1", name: "Ayşe", branchId: "merkez", active: true, instruments: [], ...o }) as Student;
const teacher = (o: Partial<Teacher>) =>
  ({ id: "t1", name: "Nilüfer", branchId: "merkez", branchIds: [], active: true, instruments: [], ...o }) as Teacher;
const req = (o: Partial<MakeupRequest>) =>
  ({ id: "m1", studentId: "s1", teacherId: "t1", branchId: "merkez", suggestedSlots: [], ...o }) as MakeupRequest;

const students = [
  student({ id: "s1", name: "Şule Aktif" }),
  student({ id: "s2", name: "Pasif Öğrenci", active: false, archivedAt: "2026-09-01" }),
  student({ id: "s3", name: "Silinen Öğrenci", active: false, deletedAt: "2026-09-02" }),
  student({ id: "s4", name: "Çağla Şube", branchId: "sahil" }),
];
const teachers = [
  teacher({ id: "t1", name: "Aktif Öğretmen" }),
  teacher({ id: "t2", name: "Pasif Öğretmen", active: false }),
  teacher({ id: "t3", name: "Kaldırılan Öğretmen", active: false, deletedAt: "2026-10-03" }),
  teacher({ id: "t4", name: "Çok Şubeli", branchId: "merkez", branchIds: ["sahil"] }),
];

describe("A — Ders programı: filtre seçenekleri yalnız aktif, geçmiş etiketler korunur", () => {
  it("pasif/arşiv/silinmiş öğrenci seçeneklerde yok; dersleri ve adı tam listeden okunmaya devam eder", () => {
    const { options, inactiveSelected } = studentFilterOptions(students, "", "");
    expect(options.map((s) => s.id).sort()).toEqual(["s1", "s4"]);
    expect(inactiveSelected).toBeNull();
    const lessons = [{ id: "l1", studentId: "s2", teacherId: "t2", branchId: "merkez" }] as Lesson[];
    // Filtre yokken pasif öğrencinin/öğretmenin geçmiş dersi takvimde kalır.
    expect(filterLessonsForCalendar(lessons, "", "", "")).toHaveLength(1);
  });

  it("eski bağlantıyla seçili pasif öğrenci sıradan seçenek olmaz, yalnız seçili değer olarak döner", () => {
    const { options, inactiveSelected } = studentFilterOptions(students, "", "s2");
    expect(options.some((s) => s.id === "s2")).toBe(false);
    expect(inactiveSelected?.id).toBe("s2");
  });

  it("öğretmen filtresi pasif ve listeden kaldırılan öğretmeni göstermez", () => {
    expect(activeTeachersForBranch(teachers, "").map((t) => t.id)).toEqual(["t1", "t4"]);
  });
});

describe("C — Telafi filtreleri", () => {
  const requests = [
    req({ id: "m1", studentId: "s1", teacherId: "t1", branchId: "merkez" }),
    req({ id: "m2", studentId: "s2", teacherId: "t2", branchId: "merkez" }), // pasif öğrenci + pasif öğretmen
    req({ id: "m3", studentId: "s4", teacherId: "t4", branchId: "sahil" }),
    req({
      id: "m4",
      studentId: "s1",
      teacherId: "t1",
      branchId: "sahil",
      suggestedSlots: [{ teacherId: "t4" } as MakeupRequest["suggestedSlots"][number]],
    }),
  ];

  it("filtre yokken pasif kişilerin geçmiş talepleri gizlenmez", () => {
    expect(filterMakeupRequests(requests, EMPTY_MAKEUP_FILTERS).map((r) => r.id)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("öğrenci + şube + öğretmen AND ile birleşir; öğretmen = talebin öğretmeni (önerilen yedek değil)", () => {
    expect(filterMakeupRequests(requests, { studentId: "s1", branchId: "sahil", teacherId: "" }).map((r) => r.id)).toEqual(["m4"]);
    expect(filterMakeupRequests(requests, { studentId: "", branchId: "", teacherId: "t4" }).map((r) => r.id)).toEqual(["m3"]);
    expect(filterMakeupRequests(requests, { studentId: "s1", branchId: "merkez", teacherId: "t4" })).toEqual([]);
  });

  it("filtre sayfalamadan önce uygulanır: toplam ve sayfa sayısı filtre kapsamından gelir", () => {
    const many = Array.from({ length: 30 }, (_, i) => req({ id: `h${i}`, branchId: i % 3 === 0 ? "sahil" : "merkez" }));
    const scoped = filterMakeupRequests(many, { ...EMPTY_MAKEUP_FILTERS, branchId: "sahil" });
    const pageSize = 25;
    expect(scoped).toHaveLength(10);
    expect(Math.max(1, Math.ceil(scoped.length / pageSize))).toBe(1);
    expect(scoped.slice(0, pageSize).every((r) => r.branchId === "sahil")).toBe(true);
  });

  it("seçenekler yalnız aktif kişiler; çok şubeli öğretmen her iki şubede görünür; PII taşımaz", () => {
    const sOpts = makeupStudentOptions(students);
    expect(sOpts.map((o) => o.id).sort()).toEqual(["s1", "s4"]);
    expect(Object.keys(sOpts[0]).sort()).toEqual(["branchIds", "id", "name"]);
    const tOpts = makeupTeacherOptions(teachers);
    expect(tOpts.map((o) => o.id).sort()).toEqual(["t1", "t4"]);
    expect(optionsForBranch(tOpts, "sahil").map((o) => o.id)).toEqual(["t4"]);
    expect(optionsForBranch(sOpts, "sahil").map((o) => o.id)).toEqual(["s4"]);
  });

  it("şube değişince uyumsuz öğrenci/öğretmen temizlenir, uyumlu olan kalır", () => {
    const sOpts = makeupStudentOptions(students);
    const tOpts = makeupTeacherOptions(teachers);
    expect(filtersForBranchChange({ studentId: "s1", branchId: "", teacherId: "t4" }, "sahil", sOpts, tOpts)).toEqual({
      studentId: "",
      branchId: "sahil",
      teacherId: "t4",
    });
  });

  it("URL: filtre kimlikleri ve durum korunur, filtre değişince sayfa 1'e döner", () => {
    expect(makeupFilterHref({ studentId: "s1", branchId: "sahil", teacherId: "t4", durum: "acil" })).toBe(
      "/panel/telafi?durum=acil&ogrenci=s1&sube=sahil&ogretmen=t4"
    );
    expect(makeupFilterHref({ studentId: "s1", sayfa: 3 })).toBe("/panel/telafi?ogrenci=s1&sayfa=3");
  });

  it("öğrenci araması Türkçe harf/büyük-küçük harf duyarsız", () => {
    const opts = makeupStudentOptions(students);
    expect(searchMakeupStudents(opts, "sule").map((o) => o.id)).toEqual(["s1"]);
    expect(searchMakeupStudents(opts, "ÇAĞ").map((o) => o.id)).toEqual(["s4"]);
    expect(searchMakeupStudents(opts, "pasif")).toEqual([]);
  });
});

describe("Yetki/kapsam — başka kurumun veya bilinmeyen kimlik filtre olarak uygulanmaz", () => {
  it("kapsamdaki veride olmayan öğrenci/öğretmen/şube kimliği yok sayılır", () => {
    const scope = { students, teachers, branchIds: ["merkez", "sahil"] };
    expect(parseMakeupFilters({ ogrenci: "other-tenant-s9", sube: "baska-kurum", ogretmen: "t-x" }, scope)).toEqual(
      EMPTY_MAKEUP_FILTERS
    );
    // Pasif ama kapsamdaki öğrenci (eski bağlantı) yetkili geçmiş erişimi için korunur.
    expect(parseMakeupFilters({ ogrenci: "s2" }, scope).studentId).toBe("s2");
  });
});

describe("B — Önerilen saatler varsayılan kapalı", () => {
  it("ilk render kapalı: aria-expanded=false, panel boş ve gizli, etiket 'göster'", () => {
    const html = renderToStaticMarkup(
      createElement(MakeupSuggestionsDisclosure, { requestId: "m1", count: 3 }, "ONERI-ICERIGI")
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="telafi-oneriler-m1"');
    expect(html).toContain("Önerilen saatleri göster");
    expect(html).not.toContain("ONERI-ICERIGI");
    expect(html).toMatch(/id="telafi-oneriler-m1" hidden=""/);
  });

  it("açık durumda etiket 'gizle' olur", () => {
    expect(suggestionsToggleLabel(true)).toBe("Önerilen saatleri gizle");
    expect(suggestionsToggleLabel(false)).toBe("Önerilen saatleri göster");
  });
});
