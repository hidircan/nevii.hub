import { describe, it, expect } from "vitest";
import { taskSegmentQuery, TASK_SEGMENTS } from "../task-segments";

describe("taskSegmentQuery", () => {
  it("open → yalnız açık statüler, quickFilter yok", () => {
    expect(taskSegmentQuery("open")).toEqual({ status: ["TODO", "IN_PROGRESS", "BLOCKED"] });
  });

  it("today → quickFilter=today + açık statüler", () => {
    expect(taskSegmentQuery("today")).toEqual({ quickFilter: "today", status: ["TODO", "IN_PROGRESS", "BLOCKED"] });
  });

  it("week → quickFilter=week + açık statüler", () => {
    expect(taskSegmentQuery("week")).toEqual({ quickFilter: "week", status: ["TODO", "IN_PROGRESS", "BLOCKED"] });
  });

  it("overdue → yalnız quickFilter (tool zaten açık statüyle sınırlıyor)", () => {
    expect(taskSegmentQuery("overdue")).toEqual({ quickFilter: "overdue" });
  });

  it("completed → yalnız quickFilter", () => {
    expect(taskSegmentQuery("completed")).toEqual({ quickFilter: "completed" });
  });

  it("her segment tanımı TASK_SEGMENTS listesinde karşılık bulur", () => {
    for (const s of TASK_SEGMENTS) {
      expect(() => taskSegmentQuery(s.key)).not.toThrow();
    }
  });
});
