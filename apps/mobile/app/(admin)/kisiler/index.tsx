import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { AppHeader, Avatar, Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, SearchInput, StatusBadge, StudentCard } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useTheme } from "../../../src/theme/theme-context";
import type { AdminStudentsResponse, TeachersResponse } from "../../../src/types/api";

type Segment = "students" | "teachers" | "parents";

export default function KisilerIndex() {
  const t = useTheme();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("students");
  const [query, setQuery] = useState("");

  const students = useApiGet<AdminStudentsResponse>("/api/v1/students");
  const teachers = useApiGet<TeachersResponse>("/api/v1/teachers");

  const q = query.trim().toLocaleLowerCase("tr-TR");

  const filteredStudents = useMemo(() => {
    if (students.status !== "success") return [];
    return students.data.students.filter((s) => !q || s.name.toLocaleLowerCase("tr-TR").includes(q));
  }, [students, q]);

  const filteredTeachers = useMemo(() => {
    if (teachers.status !== "success") return [];
    return teachers.data.teachers.filter((tt) => !q || tt.name.toLocaleLowerCase("tr-TR").includes(q));
  }, [teachers, q]);

  const filteredParents = useMemo(() => {
    if (students.status !== "success") return [];
    return students.data.students.filter((s) => !q || s.parentName.toLocaleLowerCase("tr-TR").includes(q));
  }, [students, q]);

  return (
    <Screen>
      <AppHeader title="Kişiler" />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <FilterChip label="Öğrenciler" selected={segment === "students"} onPress={() => setSegment("students")} />
        <FilterChip label="Öğretmenler" selected={segment === "teachers"} onPress={() => setSegment("teachers")} />
        <FilterChip label="Veliler" selected={segment === "parents"} onPress={() => setSegment("parents")} />
      </View>

      <View style={{ marginBottom: 12 }}>
        <SearchInput value={query} onChangeText={setQuery} placeholder={segment === "teachers" ? "Öğretmen ara" : segment === "parents" ? "Veli ara" : "Öğrenci ara"} />
      </View>

      {segment === "students" ? (
        students.status === "loading" ? (
          <LoadingSkeleton rows={5} />
        ) : students.status === "error" ? (
          <ErrorState message={students.message} onRetry={students.refresh} />
        ) : filteredStudents.length === 0 ? (
          <EmptyState icon="people-outline" title="Öğrenci bulunamadı" />
        ) : (
          <View style={{ gap: 10 }}>
            {filteredStudents.map((s) => (
              <StudentCard
                key={s.id}
                student={{ id: s.id, name: s.name, instrument: s.instruments.join(", "), level: s.teacherName ? `Öğretmen: ${s.teacherName}` : undefined }}
                onPress={() => router.push(`/(admin)/kisiler/ogrenci/${s.id}`)}
              />
            ))}
          </View>
        )
      ) : null}

      {segment === "teachers" ? (
        teachers.status === "loading" ? (
          <LoadingSkeleton rows={5} />
        ) : teachers.status === "error" ? (
          <ErrorState message={teachers.message} onRetry={teachers.refresh} />
        ) : filteredTeachers.length === 0 ? (
          <EmptyState icon="school-outline" title="Öğretmen bulunamadı" />
        ) : (
          <View style={{ gap: 10 }}>
            {filteredTeachers.map((tt) => (
              <Card key={tt.id} onPress={() => router.push(`/(admin)/kisiler/ogretmen/${tt.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar name={tt.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{tt.name}</Text>
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                      {tt.instruments.join(", ")} · {tt.activeStudentCount} öğrenci
                    </Text>
                  </View>
                  {tt.performanceLabel === "insufficient_data" ? (
                    <StatusBadge label="Yetersiz veri" tone="neutral" />
                  ) : (
                    <StatusBadge label={`${tt.performanceScore}/100`} tone={(tt.performanceScore ?? 0) >= 80 ? "success" : (tt.performanceScore ?? 0) >= 60 ? "warning" : "danger"} />
                  )}
                </View>
              </Card>
            ))}
          </View>
        )
      ) : null}

      {segment === "parents" ? (
        students.status === "loading" ? (
          <LoadingSkeleton rows={5} />
        ) : students.status === "error" ? (
          <ErrorState message={students.message} onRetry={students.refresh} />
        ) : filteredParents.length === 0 ? (
          <EmptyState icon="people-outline" title="Veli bulunamadı" />
        ) : (
          <View style={{ gap: 10 }}>
            {filteredParents.map((s) => (
              <Card key={s.id}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar name={s.parentName} />
                  <View style={{ flex: 1 }}>
                    <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{s.parentName}</Text>
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                      {s.name} velisi · {s.parentPhone}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )
      ) : null}
    </Screen>
  );
}
