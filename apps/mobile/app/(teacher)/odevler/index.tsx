import { useRouter } from "expo-router";
// SDK 57: expo-router React Navigation'ı kendi içinde taşır; context, Tabs layout'unun sağladığı örnekle aynı olmalı.
import { BottomTabBarHeightContext } from "expo-router/tabs";
import { useContext, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, EmptyState, ErrorState, FilterChip, FloatingActionButton, HomeworkCard, LoadingSkeleton, Screen } from "../../../src/components/ui";
import { useAppForegroundRefetch } from "../../../src/hooks/use-app-foreground-refetch";
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { buildStudentFilterOptions, matchesHomeworkFilter, matchesStudentFilter, type HomeworkFilter } from "../../../src/lib/homework-bucket";
import { useLocale } from "../../../src/i18n/locale-context";
import type { HomeworkResponse, TeacherStudentsResponse } from "../../../src/types/api";

const TABS: Array<{ key: HomeworkFilter; labelKey: string }> = [
  { key: "active", labelKey: "teachHw.tabActive" },
  { key: "pending", labelKey: "teachHw.tabPending" },
  { key: "upcoming", labelKey: "teachHw.tabUpcoming" },
  { key: "past", labelKey: "teachHw.tabPast" },
];

const EMPTY_KEYS: Record<HomeworkFilter, { title: string; lower: string }> = {
  active: { title: "teachHw.emptyActive", lower: "teachHw.emptyActiveLc" },
  pending: { title: "teachHw.emptyPending", lower: "teachHw.emptyPendingLc" },
  upcoming: { title: "teachHw.emptyUpcoming", lower: "teachHw.emptyUpcomingLc" },
  past: { title: "teachHw.emptyPast", lower: "teachHw.emptyPastLc" },
};

export default function OdevlerIndex() {
  const router = useRouter();
  const { t: tr } = useLocale();
  const { user } = useAuth();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [tab, setTab] = useState<HomeworkFilter>("active");
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  const res = useApiGet<HomeworkResponse>("/api/v1/homework/mine");
  const studentsRes = useApiGet<TeacherStudentsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/students` : "");
  useFocusRefetch(res.autoRefresh);
  useAppForegroundRefetch(res.autoRefresh);

  const students = useMemo(() => {
    if (studentsRes.status !== "success") return [];
    return buildStudentFilterOptions(studentsRes.data.students);
  }, [studentsRes]);

  const selectedStudentName = students.find((s) => s.id === studentFilter)?.name ?? null;

  const filtered = useMemo(() => {
    if (res.status !== "success") return [];
    return res.data.homework.filter((h) => matchesHomeworkFilter(h, tab) && matchesStudentFilter(h, studentFilter));
  }, [res, tab, studentFilter]);

  return (
    <Screen
      scroll={false}
      padded={false}
      floatingAction={<FloatingActionButton icon="add" accessibilityLabel={tr("teachHw.newHomework")} onPress={() => router.push("/(teacher)/odevler/yeni")} />}
    >
      <View style={{ paddingHorizontal: 16 }}>
        <AppHeader title={tr("teachHw.title")} showAccount="/(teacher)/hesabim" />

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          {TABS.map((tb) => (
            <FilterChip key={tb.key} label={tr(tb.labelKey)} selected={tab === tb.key} onPress={() => setTab(tb.key)} />
          ))}
        </View>

        {students.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <FilterChip label={tr("teachHw.allStudents")} selected={!studentFilter} onPress={() => setStudentFilter(null)} />
              {students.map((s) => (
                <FilterChip key={s.id} label={s.name} selected={studentFilter === s.id} onPress={() => setStudentFilter(s.id)} />
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(tabBarHeight + 16, 32) }}
        keyboardShouldPersistTaps="handled"
      >
        {res.status === "loading" ? (
          <LoadingSkeleton rows={4} />
        ) : res.status === "error" ? (
          <ErrorState message={res.message} onRetry={res.refresh} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="book-outline"
            title={tr(EMPTY_KEYS[tab].title)}
            description={selectedStudentName ? tr("teachHw.emptyFor", { name: selectedStudentName, title: tr(EMPTY_KEYS[tab].lower) }) : undefined}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map((h) => (
              <HomeworkCard key={h.id} homework={h} onPress={() => router.push(`/(teacher)/odevler/${h.id}`)} />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
