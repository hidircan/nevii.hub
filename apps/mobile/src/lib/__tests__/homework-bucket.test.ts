import { describe, it, expect } from "vitest";
import { buildStudentFilterOptions, homeworkBucket, isActiveHomework, matchesHomeworkFilter, matchesStudentFilter } from "../homework-bucket";
import type { Homework } from "../../types/api";

const NOW = new Date(2026, 7, 26);

function hw(overrides: Partial<Homework> = {}): Homework {
  return { id: "h1", title: "Ödev", ...overrides };
}

describe("homeworkBucket", () => {
  it("PENDING + süresi geçmiş → bekleyen", () => {
    expect(homeworkBucket(hw({ status: "PENDING", dueDate: "2026-08-20" }), NOW)).toBe("pending");
  });

  it("PENDING + süresi henüz gelmemiş → yaklaşan", () => {
    expect(homeworkBucket(hw({ status: "PENDING", dueDate: "2026-09-01" }), NOW)).toBe("upcoming");
  });

  it("SUBMITTED + süresi gelecekte → yaklaşan", () => {
    expect(homeworkBucket(hw({ status: "SUBMITTED", dueDate: "2026-09-01" }), NOW)).toBe("upcoming");
  });

  it("REVIEWED + süresi geçmiş → geçmiş", () => {
    expect(homeworkBucket(hw({ status: "REVIEWED", dueDate: "2026-08-01" }), NOW)).toBe("past");
  });

  it("son tarih yoksa → yaklaşan (asla kaybolmaz)", () => {
    expect(homeworkBucket(hw({ status: "PENDING" }), NOW)).toBe("upcoming");
  });

  it("her ödev tam olarak bir sekmeye düşer (ayrık kümeler)", () => {
    const samples: Homework[] = [
      hw({ status: "PENDING", dueDate: "2026-08-20" }),
      hw({ status: "PENDING", dueDate: "2026-09-01" }),
      hw({ status: "SUBMITTED", dueDate: "2026-08-01" }),
      hw({ status: "REVIEWED", dueDate: "2026-09-01" }),
      hw({ status: "PENDING" }),
    ];
    for (const s of samples) {
      const bucket = homeworkBucket(s, NOW);
      expect(["pending", "upcoming", "past"]).toContain(bucket);
    }
  });
});

describe("isActiveHomework / matchesHomeworkFilter (default-tab regression)", () => {
  it("PENDING with a future due date counts as active (was hidden by the old 'pending'-only default)", () => {
    const h = hw({ status: "PENDING", dueDate: "2026-09-01" });
    expect(isActiveHomework(h, NOW)).toBe(true);
    expect(matchesHomeworkFilter(h, "active", NOW)).toBe(true);
  });

  it("PENDING and overdue also counts as active", () => {
    const h = hw({ status: "PENDING", dueDate: "2026-08-20" });
    expect(isActiveHomework(h, NOW)).toBe(true);
    expect(matchesHomeworkFilter(h, "active", NOW)).toBe(true);
  });

  it("REVIEWED and overdue (past) is not active", () => {
    const h = hw({ status: "REVIEWED", dueDate: "2026-08-01" });
    expect(isActiveHomework(h, NOW)).toBe(false);
    expect(matchesHomeworkFilter(h, "active", NOW)).toBe(false);
  });

  it("matchesHomeworkFilter still isolates pending/upcoming/past individually", () => {
    const overduePending = hw({ status: "PENDING", dueDate: "2026-08-20" });
    const futurePending = hw({ status: "PENDING", dueDate: "2026-09-01" });
    const past = hw({ status: "REVIEWED", dueDate: "2026-08-01" });

    expect(matchesHomeworkFilter(overduePending, "pending", NOW)).toBe(true);
    expect(matchesHomeworkFilter(overduePending, "upcoming", NOW)).toBe(false);
    expect(matchesHomeworkFilter(futurePending, "upcoming", NOW)).toBe(true);
    expect(matchesHomeworkFilter(futurePending, "pending", NOW)).toBe(false);
    expect(matchesHomeworkFilter(past, "past", NOW)).toBe(true);
    expect(matchesHomeworkFilter(past, "active", NOW)).toBe(false);
  });
});

describe("buildStudentFilterOptions (full teacher roster, not just students with homework)", () => {
  it("includes every permitted student, including one with zero homework", () => {
    const roster = [
      { id: "s2", name: "Zeynep" },
      { id: "s1", name: "Ahmet" },
      { id: "s3", name: "Mert" },
    ];
    const options = buildStudentFilterOptions(roster);
    expect(options.map((o) => o.id)).toEqual(["s1", "s3", "s2"]);
  });

  it("does not derive options from the homework list at all", () => {
    const roster = [{ id: "s1", name: "Ahmet" }];
    expect(buildStudentFilterOptions(roster)).toEqual([{ id: "s1", name: "Ahmet" }]);
  });
});

describe("matchesStudentFilter (by id, not by display name)", () => {
  it("matches everything when no student is selected", () => {
    expect(matchesStudentFilter(hw({ studentId: "s1" }), null)).toBe(true);
  });

  it("matches only the selected student's homework", () => {
    expect(matchesStudentFilter(hw({ studentId: "s1" }), "s1")).toBe(true);
    expect(matchesStudentFilter(hw({ studentId: "s2" }), "s1")).toBe(false);
  });

  it("does not conflate two different students who share a display name", () => {
    const a = hw({ studentId: "s1", studentName: "Ahmet Yılmaz" });
    const b = hw({ studentId: "s2", studentName: "Ahmet Yılmaz" });
    expect(matchesStudentFilter(a, "s1")).toBe(true);
    expect(matchesStudentFilter(b, "s1")).toBe(false);
  });
});
