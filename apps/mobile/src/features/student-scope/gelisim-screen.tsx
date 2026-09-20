import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { AppHeader, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, ProgressBar, Screen, SectionHeader } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useSelectedStudentId } from "../../student/student-context";
import { useNow } from "../../hooks/use-now";
import { relativeDayLabel } from "../../lib/date";
import { useTheme } from "../../theme/theme-context";
import { AttendanceCounters } from "./attendance-counters";
import type { AssessmentsResponse, AttendanceLedgerResponse, CurriculumResponse, ScheduleResponse, StudentProfile } from "../../types/api";

const RECENT_LESSON_WINDOW_DAYS = 90;

export function StudentScopeGelisimScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const router = useRouter();
  const now = useNow();
  const studentId = useSelectedStudentId();

  const profile = useApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");
  const curriculum = useApiGet<CurriculumResponse>(studentId ? `/api/v1/students/${studentId}/curriculum` : "");
  // Sayaçlar ledger'dan (limit=1 — yalnız counts gerekir); raporla AYNI kaynak, tutarsızlık yok.
  const attendance = useApiGet<AttendanceLedgerResponse>(
    studentId ? `/api/v1/students/${studentId}/attendance-ledger?direction=past&limit=1` : ""
  );
  const assessments = useApiGet<AssessmentsResponse>(studentId ? `/api/v1/assessments/${studentId}` : "");
  const schedule = useApiGet<ScheduleResponse>(studentId ? `/api/v1/students/${studentId}/schedule` : "");

  // Web parity (src/app/veli/degerlendirme/page.tsx, src/app/ogrenci/degerlendirme/page.tsx):
  // değerlendirilebilir öğretmenler = mevcut atanmış öğretmen + son 90 gün içinde
  // bu öğrenciyle dersi olan tüm öğretmenler (öğretmen değişikliği geçmişini kapsar).
  const eligibleTeachers = useMemo(() => {
    if (profile.status !== "success") return [];
    const cutoff = now - RECENT_LESSON_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const byId = new Map<string, { teacherId: string; teacherName: string; lastLessonAt?: string }>();
    if (profile.data.teacherId) {
      byId.set(profile.data.teacherId, { teacherId: profile.data.teacherId, teacherName: profile.data.teacherName ?? "" });
    }
    if (schedule.status === "success") {
      for (const lesson of schedule.data.lessons) {
        if (!lesson.teacherId || new Date(lesson.startAt).getTime() < cutoff) continue;
        const existing = byId.get(lesson.teacherId);
        if (!existing || !existing.lastLessonAt || lesson.startAt > existing.lastLessonAt) {
          byId.set(lesson.teacherId, {
            teacherId: lesson.teacherId,
            teacherName: lesson.teacherName ?? existing?.teacherName ?? "",
            lastLessonAt: lesson.startAt,
          });
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.teacherName.localeCompare(b.teacherName, "tr"));
  }, [profile, schedule, now]);

  if (!studentId) {
    return (
      <Screen>
        <AppHeader title="Gelişim" showAccount={`${basePath}/hesabim`} />
        <EmptyState icon="alert-circle-outline" title="Öğrenci bilgisi bulunamadı" />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Gelişim" showAccount={`${basePath}/hesabim`} />

      <SectionHeader title="Müfredat ilerlemesi" />
      {curriculum.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : curriculum.status === "error" ? (
        <ErrorState message={curriculum.message} onRetry={curriculum.refresh} code={curriculum.code} />
      ) : (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Genel ilerleme</Text>
            <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>%{Math.round(curriculum.data.overallPercent)}</Text>
          </View>
          <ProgressBar progress={curriculum.data.overallPercent} />
          {curriculum.data.topics.length > 0 ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              {curriculum.data.topics.slice(0, 5).map((topic) => (
                <View key={topic.id}>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 4 }]}>{topic.title}</Text>
                  <ProgressBar progress={topic.progressPercent} height={6} tone="info" />
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      )}

      <SectionHeader title="Ders devam özeti" />
      {attendance.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : attendance.status === "error" ? (
        <ErrorState message={attendance.message} onRetry={attendance.refresh} code={attendance.code} />
      ) : (
        <AttendanceCounters
          counts={attendance.data.counts}
          onOpen={(status) => router.push(`${basePath}/devam-raporu?status=${status}`)}
        />
      )}

      <SectionHeader title="Öğretmen notları" />
      {assessments.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : assessments.status === "error" ? (
        <ErrorState message={assessments.message} onRetry={assessments.refresh} code={assessments.code} />
      ) : assessments.data.assessments.length === 0 ? (
        <EmptyState icon="chatbubble-outline" title="Henüz öğretmen notu yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {[...assessments.data.assessments].reverse().slice(0, 3).map((a) => (
            <Card key={a.id}>
              <Text style={[t.typography.caption, { color: t.colors.textFaint, marginBottom: 6 }]}>{relativeDayLabel(new Date(a.createdAt))}</Text>
              <Text style={[t.typography.body, { color: t.colors.text }]}>{a.strengthNote}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>Sonraki adımlar: {a.nextStepsNote}</Text>
            </Card>
          ))}
        </View>
      )}

      <SectionHeader title="Ders materyalleri" actionLabel="Tümü" onAction={() => router.push(`${basePath}/gelisim/materyaller`)} />
      <Card onPress={() => router.push(`${basePath}/gelisim/materyaller`)}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Icon name="folder-open-outline" size={18} color={t.colors.primary} />
          <Text style={[t.typography.body, { color: t.colors.text, flex: 1 }]}>Öğretmenin paylaştığı materyalleri görüntüle</Text>
          <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
        </View>
      </Card>

      <SectionHeader title="Öğretmen değerlendirmesi" />
      <Text style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 10 }]}>
        Öğretmeninizi anonim olarak değerlendirin — kimliğiniz öğretmenle paylaşılmaz.
      </Text>
      {profile.status === "loading" || schedule.status === "loading" ? (
        <LoadingSkeleton rows={1} />
      ) : eligibleTeachers.length === 0 ? (
        <EmptyState icon="star-outline" title="Değerlendirilebilecek öğretmen yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {eligibleTeachers.map((teacher) => (
            <Card
              key={teacher.teacherId}
              onPress={() =>
                router.push(`${basePath}/gelisim/degerlendirme?teacherId=${teacher.teacherId}&teacherName=${encodeURIComponent(teacher.teacherName)}`)
              }
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon name="star-outline" size={18} color={t.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{teacher.teacherName || "Öğretmen"}</Text>
                  {teacher.lastLessonAt ? (
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                      Son ders: {relativeDayLabel(new Date(teacher.lastLessonAt))}
                    </Text>
                  ) : null}
                </View>
                <Icon name="chevron-forward" size={16} color={t.colors.textFaint} />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
