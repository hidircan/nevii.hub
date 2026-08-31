import { Text, View } from "react-native";
import { Card, ErrorState, LoadingSkeleton, ProgressBar, SectionHeader, StatusBadge } from "./ui";
import { useApiGet } from "../hooks/use-api";
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
  const value = pct(component);
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[t.typography.body, { color: t.colors.text, fontWeight: "600" }]}>{label}</Text>
        {value ? (
          <Text style={[t.typography.body, { color: t.colors.text, fontWeight: "700" }]}>{value}</Text>
        ) : (
          <StatusBadge label="Yetersiz veri" tone="neutral" />
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
        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Son 30 gün · {periodStart} — {periodEnd}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>Toplam skor</Text>
          {r.score === null ? (
            <StatusBadge label="Yetersiz veri" tone="neutral" />
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
            Bu dönemde hiçbir bileşen için yeterli veri yok.
          </Text>
        )}
      </Card>

      <SectionHeader title="Bileşenler" />
      <Card>
        <ComponentRow
          label="Öğretmen yoklama oranı"
          component={attendance}
          detail={
            attendance.hasData
              ? `${attendance.attendedCount}/${attendance.plannedLessonCount} ders geldi · ${attendance.absentCount} gelmedi · ${attendance.excusedCount} mazeretli`
              : "Bu dönemde işaretlenmiş öğretmen yoklaması yok."
          }
        />
        <View style={{ height: 1, backgroundColor: t.colors.divider, marginVertical: 4 }} />
        <ComponentRow
          label="Veli/öğrenci geri bildirim ortalaması"
          component={feedback}
          detail={
            feedback.hasData
              ? `${feedback.responseCount} yanıt · anonimlik eşiği karşılandı`
              : feedback.responseCount > 0
                ? `${feedback.responseCount} yanıt var, anonimlik eşiği için yetersiz`
                : "Bu dönemde geri bildirim yok."
          }
        />
        <View style={{ height: 1, backgroundColor: t.colors.divider, marginVertical: 4 }} />
        <ComponentRow
          label="Görev tamamlama / zamanında tamamlama"
          component={tasks}
          detail={
            tasks.hasData
              ? `${tasks.completedCount}/${tasks.totalAssigned} tamamlandı · ${tasks.overdueCount} gecikmiş · zamanında: ${
                  tasks.onTimeRate !== null ? `%${Math.round(tasks.onTimeRate * 100)}` : "—"
                }`
              : "Bu dönemde atanmış görev yok."
          }
        />
        <View style={{ height: 1, backgroundColor: t.colors.divider, marginVertical: 4 }} />
        <ComponentRow
          label="Ders sonrası ödev verme oranı"
          component={homework}
          detail={
            homework.hasData
              ? `${homework.assignedCount}/${homework.eligibleLessonCount} uygun derste ödev verildi · ${homework.submittedCount} teslim edildi · ${homework.reviewedCount} incelendi`
              : "Bu dönemde ödev verilmeye uygun işlenmiş ders yok."
          }
        />
      </Card>
    </>
  );
}
