/**
 * Personel performans — saf agregasyon (I/O yok).
 * Görev erken/zamanında/geç + tahsilat sayımı.
 */
import { describe, it, expect } from "vitest";
import {
  computeStaffPerformanceMetrics,
  computeStaffPerformanceReport,
  periodFromYearMonth,
  previousYearMonth,
  currentYearMonth,
} from "../staff-performance";
import type { Payment, StaffMember, Student, Task } from "../types";

function task(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: "Görev",
    status: "TODO",
    priority: "MEDIUM",
    category: "Kayıt",
    followerIds: [],
    createdById: "u1",
    progressPercent: 0,
    tags: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> & Pick<Payment, "id">): Payment {
  return {
    studentId: "stu1",
    amount: 1000,
    paidAmount: 1000,
    status: "paid",
    dueDate: "2026-09-05",
    description: "Taksit",
    ...overrides,
  };
}

function staff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: "staff_1",
    name: "Ayşe Yılmaz",
    position: "Resepsiyon",
    status: "active",
    portalUserId: "user_ayse",
    branchId: "evka3",
    createdBy: "owner",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function student(overrides: Partial<Student> & Pick<Student, "id">): Student {
  return {
    name: "Öğrenci",
    email: "o@test.com",
    phone: "555",
    parentName: "Veli",
    parentPhone: "555",
    branchId: "evka3",
    instruments: ["Piyano"],
    teacherId: "t1",
    packageName: "Standart",
    weeklyLessonCount: 1,
    monthlyFee: 2000,
    active: true,
    notes: "",
    createdAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

const SEP = periodFromYearMonth("2026-09");

describe("staff-performance period helpers", () => {
  it("periodFromYearMonth ay sınırlarını doğru üretir", () => {
    expect(periodFromYearMonth("2026-09")).toEqual({
      yearMonth: "2026-09",
      startYmd: "2026-09-01",
      endYmd: "2026-09-30",
    });
    expect(periodFromYearMonth("2026-02").endYmd).toBe("2026-02-28");
    expect(previousYearMonth("2026-01")).toBe("2025-12");
    expect(currentYearMonth("2026-09-22")).toBe("2026-09");
  });
});

describe("computeStaffPerformanceMetrics — görev erken/zamanında/geç", () => {
  const assigneeIds = new Set(["user_ayse"]);

  it("erken, zamanında ve geç tamamlananları ayırır", () => {
    const tasks = [
      task({
        id: "t_early",
        assigneeId: "user_ayse",
        status: "COMPLETED",
        dueDate: "2026-09-20",
        completedAt: "2026-09-15T12:00:00.000Z",
      }),
      task({
        id: "t_ontime",
        assigneeId: "user_ayse",
        status: "COMPLETED",
        dueDate: "2026-09-18",
        completedAt: "2026-09-18T18:00:00.000Z",
      }),
      task({
        id: "t_late",
        assigneeId: "user_ayse",
        status: "COMPLETED",
        dueDate: "2026-09-10",
        completedAt: "2026-09-12T09:00:00.000Z",
      }),
      task({
        id: "t_open",
        assigneeId: "user_ayse",
        status: "TODO",
        dueDate: "2026-09-25",
      }),
      task({
        id: "t_other",
        assigneeId: "user_other",
        status: "COMPLETED",
        dueDate: "2026-09-15",
        completedAt: "2026-09-14T00:00:00.000Z",
      }),
    ];

    const m = computeStaffPerformanceMetrics({
      period: SEP,
      staff: staff(),
      tasks,
      payments: [],
      students: [],
      assigneeIds,
      collectorUserId: "user_ayse",
    });

    expect(m.tasksAssigned).toBe(4); // other hariç
    expect(m.tasksCompleted).toBe(3);
    expect(m.tasksEarly).toBe(1);
    expect(m.tasksOnTime).toBe(2); // early + ontime
    expect(m.tasksLate).toBe(1);
    expect(m.taskCompletionRate).toBe(0.75); // 3/4
    expect(m.onTimeRate).toBe(Math.round((2 / 3) * 1000) / 1000);
  });

  it("dueDate olmayan görevde createdAt ile döneme girer; onTime sayılmaz", () => {
    const tasks = [
      task({
        id: "t_nodue",
        assigneeId: "user_ayse",
        status: "COMPLETED",
        createdAt: "2026-09-05T00:00:00.000Z",
        completedAt: "2026-09-06T00:00:00.000Z",
      }),
    ];
    const m = computeStaffPerformanceMetrics({
      period: SEP,
      staff: staff(),
      tasks,
      payments: [],
      students: [],
      assigneeIds,
      collectorUserId: "user_ayse",
    });
    expect(m.tasksAssigned).toBe(1);
    expect(m.tasksCompleted).toBe(1);
    expect(m.tasksOnTime).toBe(0);
    expect(m.onTimeRate).toBeNull();
  });

  it("başka aydaki görevleri saymaz", () => {
    const tasks = [
      task({
        id: "t_aug",
        assigneeId: "user_ayse",
        status: "COMPLETED",
        dueDate: "2026-08-20",
        completedAt: "2026-08-19T00:00:00.000Z",
      }),
    ];
    const m = computeStaffPerformanceMetrics({
      period: SEP,
      staff: staff(),
      tasks,
      payments: [],
      students: [],
      assigneeIds,
      collectorUserId: "user_ayse",
    });
    expect(m.tasksAssigned).toBe(0);
    expect(m.tasksCompleted).toBe(0);
  });
});

describe("computeStaffPerformanceMetrics — tahsilat", () => {
  it("receivedByUserId ve paidAt ile adet/tutar sayar", () => {
    const payments = [
      payment({
        id: "p1",
        receivedByUserId: "user_ayse",
        paidAt: "2026-09-08T14:00:00.000Z",
        amount: 1500,
        paidAmount: 1500,
        status: "paid",
      }),
      payment({
        id: "p2",
        receivedByUserId: "user_ayse",
        paidAt: "2026-09-12T10:00:00.000Z",
        amount: 2000,
        paidAmount: 500,
        status: "partial",
      }),
      payment({
        id: "p3",
        receivedByUserId: "user_other",
        paidAt: "2026-09-08T14:00:00.000Z",
        amount: 999,
        paidAmount: 999,
      }),
      payment({
        id: "p4",
        receivedByUserId: "user_ayse",
        paidAt: "2026-08-30T14:00:00.000Z",
        amount: 800,
        paidAmount: 800,
      }),
      payment({
        id: "p5",
        receivedByUserId: "user_ayse",
        status: "pending",
        amount: 700,
        paidAmount: 0,
      }),
    ];

    const m = computeStaffPerformanceMetrics({
      period: SEP,
      staff: staff(),
      tasks: [],
      payments,
      students: [student({ id: "stu1", branchId: "evka3" })],
      assigneeIds: new Set(["user_ayse"]),
      collectorUserId: "user_ayse",
    });

    expect(m.paymentsCollectedCount).toBe(2);
    expect(m.paymentsCollectedAmount).toBe(2000); // 1500 + 500
    expect(m.branchBreakdown.some((b) => b.branchId === "evka3" && b.paymentsCollectedCount === 2)).toBe(true);
  });

  it("portal kullanıcısı yoksa tahsilat 0 kalır", () => {
    const m = computeStaffPerformanceMetrics({
      period: SEP,
      staff: staff({ portalUserId: undefined }),
      tasks: [],
      payments: [
        payment({
          id: "p1",
          receivedByUserId: "user_ayse",
          paidAt: "2026-09-08T14:00:00.000Z",
        }),
      ],
      students: [],
      assigneeIds: new Set(["staff_1"]),
      collectorUserId: null,
    });
    expect(m.paymentsCollectedCount).toBe(0);
    expect(m.paymentsCollectedAmount).toBe(0);
  });
});

describe("computeStaffPerformanceReport", () => {
  it("bu ay ve önceki ayı birlikte üretir; öğrenci kaydı atfedilemez etiketli", () => {
    const s = staff();
    const report = computeStaffPerformanceReport({
      staff: s,
      tasks: [
        task({
          id: "t1",
          assigneeId: "user_ayse",
          status: "COMPLETED",
          dueDate: "2026-09-10",
          completedAt: "2026-09-09T00:00:00.000Z",
        }),
        task({
          id: "t2",
          assigneeId: "user_ayse",
          status: "COMPLETED",
          dueDate: "2026-08-10",
          completedAt: "2026-08-11T00:00:00.000Z",
        }),
      ],
      data: {
        payments: [
          payment({
            id: "p1",
            receivedByUserId: "user_ayse",
            paidAt: "2026-09-05T00:00:00.000Z",
            amount: 1200,
            paidAmount: 1200,
          }),
        ],
        students: [
          student({ id: "s1", createdAt: "2026-09-03T00:00:00.000Z" }),
          student({ id: "s2", createdAt: "2026-08-03T00:00:00.000Z" }),
        ],
      },
      yearMonth: "2026-09",
    });

    expect(report.current.tasksCompleted).toBe(1);
    expect(report.previous.tasksCompleted).toBe(1);
    expect(report.previous.tasksLate).toBe(1);
    expect(report.current.paymentsCollectedCount).toBe(1);
    expect(report.current.paymentsCollectedAmount).toBe(1200);
    expect(report.current.newStudentRegistrations.attributable).toBe(false);
    expect(report.current.newStudentRegistrations.count).toBe(1);
    expect(report.previous.newStudentRegistrations.count).toBe(1);
    expect(report.linkageNote).toBeNull();
  });

  it("portalUserId yoksa linkageNote döner", () => {
    const report = computeStaffPerformanceReport({
      staff: staff({ portalUserId: undefined }),
      tasks: [],
      data: { payments: [], students: [] },
      yearMonth: "2026-09",
    });
    expect(report.linkageNote).toMatch(/portal/i);
    expect(report.portalUserId).toBeNull();
  });
});
