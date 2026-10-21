import { Text, View } from "react-native";
import { Card, ErrorState, LoadingSkeleton, ProgressBar, SectionHeader, StatusBadge } from "./ui";
import { useApiGet } from "../hooks/use-api";
import { useLocale } from "../i18n/locale-context";
import { format } from "../lib/date";
import { useTheme } from "../theme/theme-context";
import type { PerformanceComponentV2, TeacherPerformanceV2Response } from "../types/api";

const now = new Date();
const periodStart = format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30), "yyyy-MM-dd");
const periodEnd = format(now, "yyyy-MM-dd");

function scoreTone(score: number): "success" | "warning" | "danger" {
  return score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
}

/** Bir bileşenin normalizedValue'sunu (0-100) yüzde metnine çevirir; veri yoksa null döner. */
function pct(component: PerformanceComponentV2): string | null {
  return component.hasData && component.normalizedValue !== null ? `%${Math.round(component.normalizedValue)}` : null;
}

function ComponentRow({ label, component, detail }: { label: string; component: PerformanceComponentV2; detail: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const value = pct(component);
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{label}</Text>
        {value ? (
          <Text style={[t.typography.bodyStrong, { color: t.colors.text, fontWeight: "700" }]}>{value}</Text>
        ) : (
          <StatusBadge label={tr("perf.insufficient")} tone="neutral" />
        )}
      </View>
      <View style={{ marginTop: 8 }}>
        <ProgressBar progress={component.hasData ? component.normalizedValue ?? 0 : 0} tone="primary" />
      </View>
      <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>{detail}</Text>
    </View>
  );
}

/** GET /api/v1/teachers/:teacherId/performance-v2 (son 30 gün) — skor + 4 bileşen. Admin öğretmen detayı ve öğretmenin kendi hesabım ekranı arasında paylaşılır. */
export function TeacherPerformanceV2Panel({ teacherId }: { teacherId: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const res = useApiGet<TeacherPerformanceV2Response>(
    `/api/v1/teachers/${teacherId}/performance-v2?periodStart=${periodStart}&periodEnd=${periodEnd}`
  );

  if (res.status === "loading") return <LoadingSkeleton rows={4} />;
  if (res.status === "error") return <ErrorState message={res.message} onRetry={res.refresh} />;

  const r = res.data;
  const { attendance, feedback, tasks, homework } = r.components;

  return (
    <>
      <Card>
        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("perf.last30Days")} · {periodStart} — {periodEnd}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{tr("perf.totalScore")}</Text>
          {r.score === null ? (
            <StatusBadge label={tr("perf.insufficient")} tone="neutral" />
          ) : (
            <StatusBadge label={`${r.score}/100`} tone={scoreTone(r.score)} />
          )}
        </View>
        {r.score !== null ? (
          <View style={{ marginTop: 10 }}>
            <ProgressBar progress={r.score} tone={scoreTone(r.score)} height={10} />
          </View>
        ) : (
          <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 8 }]}>
            {tr("perf.noComponentData")}
          </Text>
        )}
      </Card>

      <SectionHeader title={tr("perf.components")} />
      <Card>
        <ComponentRow
          label={tr("perf.attendanceRate")}
          component={attendance}
          detail={
            attendance.hasData
              ? tr("perf.attendanceDetail", { b: attendance.teacherCausedCount, p: attendance.plannedLessonCount })
              : tr("perf.noMarkedAttendance")
          }
        />
        <View style={{ height: 1, backgroundColor: t.colors.divider, marginVertical: 4 }} />
        <ComponentRow
          label={tr("perf.feedbackAvg")}
          component={feedback}
          detail={
            feedback.hasData
              ? tr("perf.feedbackOk", { n: feedback.responseCount })
              : feedback.responseCount > 0
                ? tr("perf.feedbackLow", { n: feedback.responseCount })
                : tr("perf.noFeedback")
          }
        />
        <View style={{ height: 1, backgroundColor: t.colors.divider, marginVertical: 4 }} />
        <ComponentRow
          label={tr("perf.taskCompletion")}
          component={tasks}
          detail={
            tasks.hasData
              ? tr("perf.taskDetail", {
                  c: tasks.completedCount,
                  t: tasks.totalAssigned,
                  o: tasks.overdueCount,
                  r: tasks.onTimeRate !== null ? `%${Math.round(tasks.onTimeRate * 100)}` : "—",
                })
              : tr("perf.noTasks")
          }
        />
        <View style={{ height: 1, backgroundColor: t.colors.divider, marginVertical: 4 }} />
        <ComponentRow
          label={tr("perf.homeworkRate")}
          component={homework}
          detail={
            homework.hasData
              ? tr("perf.homeworkDetail", {
                  a: homework.assignedCount,
                  e: homework.eligibleLessonCount,
                  s: homework.submittedCount,
                  r: homework.reviewedCount,
                })
              : tr("perf.noEligibleLessons")
          }
        />
      </Card>
    </>
  );
}
