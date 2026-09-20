import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { AppHeader, Avatar, Button, Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, SearchInput, StatusBadge, StudentCard } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useTheme } from "../../../src/theme/theme-context";
import type { AdminStudentSummary, AdminStudentsResponse, TeacherSummary, TeachersResponse } from "../../../src/types/api";

type Segment = "students" | "teachers" | "parents";

const PAGE_SIZE = 50;

/**
 * Kişiler — sunucu aramalı (`q`) + sayfalı (`limit` adımlarıyla "daha fazla")
 * + FlatList sanallaştırma. Büyük kurumlarda tüm liste çekilmez, istemci
 * filtresi YOK.
 */
export default function KisilerIndex() {
  const t = useTheme();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>("students");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  function changeSegment(next: Segment) {
    setSegment(next);
    setLimit(PAGE_SIZE);
  }

  function changeQuery(next: string) {
    setQuery(next);
    setLimit(PAGE_SIZE);
  }

  const qParam = query.trim() ? `?q=${encodeURIComponent(query.trim())}&limit=${limit}` : `?limit=${limit}`;
  const students = useApiGet<AdminStudentsResponse>(
    segment === "teachers" ? "" : `/api/v1/students${qParam}`
  );
  const teachers = useApiGet<TeachersResponse>(
    segment === "teachers" ? `/api/v1/teachers${qParam}` : ""
  );

  const studentRows: AdminStudentSummary[] = students.status === "success" ? students.data.students : [];
  const teacherRows: TeacherSummary[] = teachers.status === "success" ? teachers.data.teachers : [];
  const studentTotal = students.status === "success" ? (students.data.total ?? studentRows.length) : 0;
  const teacherTotal = teachers.status === "success" ? (teachers.data.total ?? teacherRows.length) : 0;

  const rows: Array<{ kind: "student" | "teacher" | "parent"; id: string; student?: AdminStudentSummary; teacher?: TeacherSummary }> =
    segment === "teachers"
      ? teacherRows.map((teacher) => ({ kind: "teacher" as const, id: teacher.id, teacher }))
      : studentRows.map((student) => ({ kind: segment as "student" | "parent", id: student.id, student }));

  const active = segment === "teachers" ? teachers : students;
  const total = segment === "teachers" ? teacherTotal : studentTotal;
  const emptyTitle = segment === "teachers" ? "Öğretmen bulunamadı" : segment === "parents" ? "Veli bulunamadı" : "Öğrenci bulunamadı";
  const emptyIcon = segment === "teachers" ? "school-outline" as const : "people-outline" as const;

  return (
    <Screen scroll={false}>
      <AppHeader title="Kişiler" />
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <FilterChip label="Öğrenciler" selected={segment === "students"} onPress={() => changeSegment("students")} />
              <FilterChip label="Öğretmenler" selected={segment === "teachers"} onPress={() => changeSegment("teachers")} />
              <FilterChip label="Veliler" selected={segment === "parents"} onPress={() => changeSegment("parents")} />
            </View>
            <View style={{ marginBottom: 12 }}>
              <SearchInput value={query} onChangeText={changeQuery} placeholder={segment === "teachers" ? "Öğretmen ara" : segment === "parents" ? "Veli ara" : "Öğrenci ara"} />
            </View>
            {active.status === "loading" ? <LoadingSkeleton rows={5} /> : null}
            {active.status === "error" ? <ErrorState message={active.message} onRetry={active.refresh} /> : null}
            {active.status === "success" && rows.length === 0 ? <EmptyState icon={emptyIcon} title={emptyTitle} /> : null}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "teacher" && item.teacher) {
            const tt = item.teacher;
            return (
              <Card onPress={() => router.push(`/(admin)/kisiler/ogretmen/${tt.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar name={tt.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>{tt.name}</Text>
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
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
            );
          }
          if (item.kind === "parent" && item.student) {
            const s = item.student;
            return (
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Avatar name={s.parentName} />
                  <View style={{ flex: 1 }}>
                    <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>{s.parentName}</Text>
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                      {s.name} velisi · {s.parentPhone}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          }
          if (item.student) {
            const s = item.student;
            return (
              <StudentCard
                student={{ id: s.id, name: s.name, instrument: s.instruments.join(", "), level: s.teacherName ? `Öğretmen: ${s.teacherName}` : undefined }}
                onPress={() => router.push(`/(admin)/kisiler/ogrenci/${s.id}`)}
              />
            );
          }
          return null;
        }}
        ListFooterComponent={
          active.status === "success" && total > rows.length ? (
            <View style={{ marginTop: 12 }}>
              <Button
                label={`Daha fazla göster (${rows.length}/${total})`}
                variant="secondary"
                onPress={() => setLimit((n) => n + PAGE_SIZE)}
              />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
