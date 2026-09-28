import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, EmptyState, ErrorState, LoadingSkeleton, Screen, SearchInput, StudentCard } from "../../../src/components/ui";
import { useLocale } from "../../../src/i18n/locale-context";
import { useAppForegroundRefetch } from "../../../src/hooks/use-app-foreground-refetch";
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import type { TeacherStudentsResponse } from "../../../src/types/api";

export default function OgrencilerimIndex() {
  const { user } = useAuth();
  const router = useRouter();
  const { t: tr, locale } = useLocale();
  const [query, setQuery] = useState("");

  const res = useApiGet<TeacherStudentsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/students` : "");
  useFocusRefetch(res.refresh);
  useAppForegroundRefetch(res.refresh);

  const filtered = useMemo(() => {
    if (res.status !== "success") return [];
    const tag = locale === "en" ? "en-US" : "tr-TR";
    const q = query.trim().toLocaleLowerCase(tag);
    return res.data.students.filter((s) => !q || s.name.toLocaleLowerCase(tag).includes(q));
  }, [res, query, locale]);

  return (
    <Screen edges={["top", "left", "right"]}>
      <View>
        <AppHeader title={tr("tabs.myStudents")} showAccount="/(teacher)/hesabim" />
        <View style={{ marginBottom: 12 }}>
          <SearchInput value={query} onChangeText={setQuery} placeholder={tr("teachHw.searchStudent")} />
        </View>
      </View>

      <View>
        {res.status === "loading" ? (
          <LoadingSkeleton rows={5} />
        ) : res.status === "error" ? (
          <ErrorState message={res.message} onRetry={res.refresh} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="people-outline" title={tr("teach.noStudentFound")} description={query ? tr("teach.noStudentMatch") : tr("teach.noAssignedStudents")} />
        ) : (
          <View style={{ gap: 10, paddingBottom: 24 }}>
            {filtered.map((s) => (
              <StudentCard
                key={s.id}
                student={{ ...s, instrument: s.instruments.join(", ") }}
                onPress={() => router.push(`/(teacher)/ogrencilerim/${s.id}`)}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
