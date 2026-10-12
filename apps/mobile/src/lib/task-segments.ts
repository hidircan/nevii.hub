export type TaskSegment = "open" | "today" | "week" | "overdue" | "completed";

export const TASK_SEGMENTS: Array<{ key: TaskSegment; labelKey: string }> = [
  { key: "open", labelKey: "tasks.segOpen" },
  { key: "today", labelKey: "tasks.segToday" },
  { key: "week", labelKey: "tasks.segWeek" },
  { key: "overdue", labelKey: "tasks.segOverdue" },
  { key: "completed", labelKey: "tasks.segCompleted" },
];

const OPEN_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"];

/** İş Takip segmentini `/api/v1/tasks` sorgu parametrelerine çevirir. */
export function taskSegmentQuery(segment: TaskSegment): { quickFilter?: string; status?: string[] } {
  switch (segment) {
    case "open":
      return { status: OPEN_STATUSES };
    case "today":
      return { quickFilter: "today", status: OPEN_STATUSES };
    case "week":
      return { quickFilter: "week", status: OPEN_STATUSES };
    case "overdue":
      return { quickFilter: "overdue" };
    case "completed":
      return { quickFilter: "completed" };
  }
}
