import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AppHeader, EmptyState, ErrorState, FilterChip, Icon, LessonCard, LoadingSkeleton, Screen } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { format, relativeDayLabel } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type { LessonsResponse, TeachersResponse } from "../../../src/types/api";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export default function AdminProgram() {
  const t = useTheme();
  const router = useRouter();
  const [day, setDay] = useState(() => new Date());
  const [teacherFilter, setTeacherFilter] = useState<string | null>(null);

  const from = startOfDay(day).toISOString();
  const to = endOfDay(day).toISOString();
  const res = useApiGet<LessonsResponse>(`/api/v1/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  const teachers = useApiGet<TeachersResponse>("/api/v1/teachers");

  const lessons = useMemo(() => {
    if (res.status !== "success") return [];
    return res.data.lessons.filter((l) => !teacherFilter || l.teacherId === teacherFilter);
  }, [res, teacherFilter]);

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="Program" />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Pressable onPress={() => setDay((d) => new Date(d.getTime() - 86400000))} hitSlop={8}>
          <Icon name="chevron-back" size={22} color={t.colors.text} />
        </Pressable>
        <Pressable onPress={() => setDay(new Date())} style={{ alignItems: "center" }}>
          <Text style={[t.typography.sectionTitle, { color: t.colors.text }]}>{relativeDayLabel(day)}</Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{format(day, "yyyy-MM-dd")}</Text>
        </Pressable>
        <Pressable onPress={() => setDay((d) => new Date(d.getTime() + 86400000))} hitSlop={8}>
          <Icon name="chevron-forward" size={22} color={t.colors.text} />
        </Pressable>
      </View>

      {teachers.status === "success" ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <FilterChip label="Tüm öğretmenler" selected={!teacherFilter} onPress={() => setTeacherFilter(null)} />
            {teachers.data.teachers.map((tt) => (
              <FilterChip key={tt.id} label={tt.name} selected={teacherFilter === tt.id} onPress={() => setTeacherFilter(tt.id)} />
            ))}
          </View>
        </ScrollView>
      ) : null}

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : lessons.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Bu gün için ders yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {lessons
            .sort((a, b) => a.startAt.localeCompare(b.startAt))
            .map((l) => (
              <LessonCard
                key={l.id}
                lesson={l}
                personName={`${l.studentName ?? "Öğrenci"} · ${l.teacherName ?? "Öğretmen"}`}
                onPress={() => router.push(`/(admin)/program/${l.id}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)}
              />
            ))}
        </View>
      )}
    </Screen>
  );
}
