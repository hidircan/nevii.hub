/**
 * 2026-09-22 ops turu — actor (kaydı kim açtı), bildirim metni, telafi geçmişi
 * ve ödemeler filtresi regresyonları.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { readData } from "../store";
import { createStudentTool, createTeacherTool } from "../services/tools";
import { createLessonSeriesData } from "../lesson-series";
import { filterNotifications, notificationKindLabel, presentNotificationBody, resolveNotificationHref } from "../notification-href";
import { filterMakeupHistory, type MakeupHistoryRow } from "../makeup-history-filter";
import { filterAndSortPayments, type PaymentTableFilter } from "../payment-table-filter";
import { computeStaffPerformanceMetrics, periodFromYearMonth } from "../staff-performance";
import type { ServiceContext } from "../services/context";
import type { Student } from "../types";

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

vi.mock("../audit/log", () => ({ recordAuditLog: vi.fn().mockResolvedValue(undefined) }));

function ctx(over: Partial<ServiceContext> = {}): ServiceContext {
  return { role: "SCHOOL_ADMIN", userId: "user_staff_ezgi", tenantId: DEFAULT_TENANT_ID, channel: "web", ...over };
}

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("F — kaydı açan kullanıcı saklanır", () => {
  it("öğrenci kaydı oluşturan kullanıcıyı taşır", async () => {
    const res = await createStudentTool(ctx(), {
      name: "Aktör Testi",
      parentName: "Veli",
      parentPhone: "5559998877",
      accountResponsibility: "PARENT_MANAGED",
      branchId: "erzene",
      instrument: "Piyano",
      teacherId: "t1",
      packageName: "Bireysel Aylık — 4 ders",
      weeklyLessonCount: 1,
      monthlyFee: 3000,
      firstPaymentCollected: { method: "cash", amount: 3000, collectedAt: "2026-09-01" },
      enrollmentStartDate: "2026-09-01",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    expect(data.students.find((s) => s.id === res.data.studentId)?.createdByUserId).toBe("user_staff_ezgi");
  });

  it("öğretmen kaydı oluşturan kullanıcıyı taşır", async () => {
    const res = await createTeacherTool(ctx(), {
      name: "Aktör Öğretmen",
      email: "aktor@ogretmen.com",
      phone: "0555 111 1111",
      branchId: "erzene",
      instrument: "Piyano",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const data = await readData();
    expect(data.teachers.find((t) => t.id === res.data.teacherId)?.createdByUserId).toBe("user_staff_ezgi");
  });

  it("seri planlanan her ders planlayan kullanıcıyı taşır", async () => {
    const data = await readData();
    const result = createLessonSeriesData(
      data,
      {
        studentId: "s1",
        teacherId: "t1",
        roomId: "r1",
        branchId: "erzene",
        instrument: "Piyano",
        weekday: 3,
        startTime: "14:00",
        durationMinutes: 30,
        startsOn: "2026-10-01",
        endsOn: "2026-10-31",
      },
      { skipConflicts: true, now: new Date("2026-09-22T09:00:00.000Z"), createdByUserId: "user_staff_ezgi" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdLessonIds.length).toBeGreaterThan(0);
    const created = result.data.lessons.filter((l) => result.createdLessonIds.includes(l.id));
    expect(created.every((l) => l.createdByUserId === "user_staff_ezgi")).toBe(true);
  });

  it("personel metrikleri planlanan dersi ve açtığı öğrenciyi kişiye yazar", () => {
    const period = periodFromYearMonth("2026-09");
    const students = [
      { id: "a", createdAt: "2026-09-03T10:00:00.000Z", createdByUserId: "u_ezgi" },
      { id: "b", createdAt: "2026-09-04T10:00:00.000Z", createdByUserId: "u_other" },
    ] as unknown as Student[];
    const m = computeStaffPerformanceMetrics({
      period,
      staff: { id: "st1", branchId: "erzene", portalUserId: "u_ezgi" },
      tasks: [],
      payments: [],
      students,
      lessons: [
        { createdByUserId: "u_ezgi", startAt: "2026-09-10T10:00:00.000Z" },
        { createdByUserId: "u_ezgi", startAt: "2026-10-10T10:00:00.000Z" },
      ],
      assigneeIds: new Set(["u_ezgi"]),
      collectorUserId: "u_ezgi",
    });
    expect(m.lessonsPlanned).toBe(1);
    expect(m.newStudentRegistrations.attributable).toBe(true);
    expect(m.newStudentRegistrations.count).toBe(1);
  });
});

describe("G — bildirim metni ve filtre", () => {
  const list = [
    { id: "1", kind: "student_new_registration", title: "Yeni öğrenci kaydı", body: "Ezgi Güçlü kaydı Ada Yılmaz tarafından oluşturuldu. Detay: /panel/ogrenciler/stu_1", createdAt: "2026-09-20T10:00:00.000Z" },
    { id: "2", kind: "payment_received", title: "Ödeme alındı", body: "Ali için 3.000 TL tahsilat alındı. Detay: /panel/odemeler/pay_1", createdAt: "2026-09-21T10:00:00.000Z" },
    { id: "3", kind: "legacy_kind", title: "Eski", body: "x", createdAt: "2026-08-01T10:00:00.000Z" },
  ];

  it("teknik /panel yolu ekrana basılmaz, tıklama rotası korunur", () => {
    expect(presentNotificationBody(list[0]!.body)).toBe("Ezgi Güçlü kaydı Ada Yılmaz tarafından oluşturuldu.");
    expect(presentNotificationBody(list[0]!.body)).not.toMatch(/\/panel/);
    expect(resolveNotificationHref(list[0]!.kind, list[0]!.body)).toBe("/panel/ogrenciler/stu_1");
  });

  it("tür etiketi Türkçe; bilinmeyen tür ham anahtar göstermez", () => {
    expect(notificationKindLabel("payment_received")).toBe("Ödeme alındı");
    expect(notificationKindLabel("legacy_kind")).toBe("Diğer");
  });

  it("tür, tarih aralığı ve metin filtresi; en yeni önce", () => {
    expect(filterNotifications(list, { kindLabel: "all", from: "", to: "", query: "" }).map((n) => n.id)).toEqual(["2", "1", "3"]);
    expect(filterNotifications(list, { kindLabel: "Ödeme alındı", from: "", to: "", query: "" }).map((n) => n.id)).toEqual(["2"]);
    expect(filterNotifications(list, { kindLabel: "all", from: "2026-09-20", to: "2026-09-20", query: "" }).map((n) => n.id)).toEqual(["1"]);
    expect(filterNotifications(list, { kindLabel: "all", from: "", to: "", query: "ada yılmaz" }).map((n) => n.id)).toEqual(["1"]);
    // Teknik yol aranabilir metin değildir.
    expect(filterNotifications(list, { kindLabel: "all", from: "", to: "", query: "/panel" })).toEqual([]);
  });
});

describe("E — telafi geçmişi filtresi", () => {
  const row = (over: Partial<MakeupHistoryRow>): MakeupHistoryRow => ({
    id: "r",
    studentName: "Öğrenci",
    instrument: "Piyano",
    status: "confirmed",
    lessonLabel: "—",
    slaLabel: "—",
    slaBreached: false,
    decisionNote: "—",
    decidedAt: "2026-09-10T10:00:00.000Z",
    decidedAtLabel: "10 Eylül",
    actorName: "Ezgi Güçlü",
    ...over,
  });
  const rows = [
    row({ id: "a", actorName: "Ezgi Güçlü", decidedAt: "2026-09-10T10:00:00.000Z" }),
    row({ id: "b", actorName: "Ada Yılmaz", status: "cancelled", decidedAt: "2026-09-15T10:00:00.000Z" }),
    row({ id: "c", actorName: "Sistem", status: "expired", decidedAt: "" }),
  ];

  it("işlemi yapan, durum ve karar tarihi aralığına göre süzer; en yeni önce", () => {
    expect(filterMakeupHistory(rows, { query: "", status: "all", actor: "all", from: "", to: "" }).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(filterMakeupHistory(rows, { query: "", status: "all", actor: "Ezgi Güçlü", from: "", to: "" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterMakeupHistory(rows, { query: "", status: "cancelled", actor: "all", from: "", to: "" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterMakeupHistory(rows, { query: "", status: "all", actor: "all", from: "2026-09-12", to: "" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterMakeupHistory(rows, { query: "ada", status: "all", actor: "all", from: "", to: "" }).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("H — ödemeler filtresi ve sıralama", () => {
  const base: PaymentTableFilter = {
    search: "",
    status: "all",
    actionOnly: false,
    dueFrom: "",
    dueTo: "",
    paidFrom: "",
    paidTo: "",
    minAmount: "",
    maxAmount: "",
    sortKey: "dueDate",
    sortDir: "asc",
  };
  const rows = [
    { id: "1", studentName: "Çağla", status: "paid" as const, dueDate: "2026-09-05", paidAt: "2026-09-04T10:00:00.000Z", amount: 3000 },
    { id: "2", studentName: "Ali", status: "overdue" as const, dueDate: "2026-08-05", amount: 1500 },
    { id: "3", studentName: "Berk", status: "pending" as const, dueDate: "2026-10-05", amount: 12000 },
  ];

  it("vade, tahsil tarihi ve tutar aralığı", () => {
    expect(filterAndSortPayments(rows, { ...base, dueFrom: "2026-09-01", dueTo: "2026-09-30" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterAndSortPayments(rows, { ...base, paidFrom: "2026-09-01" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterAndSortPayments(rows, { ...base, minAmount: "2.000", maxAmount: "5000" }).map((r) => r.id)).toEqual(["1"]);
  });

  it("aksiyon filtresi diğer filtrelerle birlikte çalışır (eskiden tarih filtresini atlıyordu)", () => {
    expect(filterAndSortPayments(rows, { ...base, actionOnly: true }).map((r) => r.id)).toEqual(["2"]);
    expect(filterAndSortPayments(rows, { ...base, actionOnly: true, dueFrom: "2026-09-01" })).toEqual([]);
  });

  it("sıralama: tutar azalan, öğrenci Türkçe alfabe, ödenmemiş tahsil tarihi sonda", () => {
    expect(filterAndSortPayments(rows, { ...base, sortKey: "amount", sortDir: "desc" }).map((r) => r.id)).toEqual(["3", "1", "2"]);
    expect(filterAndSortPayments(rows, { ...base, sortKey: "studentName" }).map((r) => r.studentName)).toEqual(["Ali", "Berk", "Çağla"]);
    expect(filterAndSortPayments(rows, { ...base, sortKey: "paidAt", sortDir: "desc" })[0]!.id).toBe("1");
  });
});
