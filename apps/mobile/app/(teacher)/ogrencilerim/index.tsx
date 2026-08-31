import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, EmptyState, ErrorState, LoadingSkeleton, Screen, SearchInput, StudentCard } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import type { TeacherStudentsResponse } from "../../../src/types/api";

export default function OgrencilerimIndex() {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const res = useApiGet<TeacherStudentsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/students` : "");

  const filtered = useMemo(() => {
    if (res.status !== "success") return [];
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return res.data.students.filter((s) => !q || s.name.toLocaleLowerCase("tr-TR").includes(q));
  }, [res, query]);

  return (
    <Screen edges={["top", "left", "right"]}>
      <View>
        <AppHeader title="Öğrencilerim" />
        <View style={{ marginBottom: 12 }}>
          <SearchInput value={query} onChangeText={setQuery} placeholder="Öğrenci ara" />
        </View>
      </View>

      <View>
        {res.status === "loading" ? (
          <LoadingSkeleton rows={5} />
        ) : res.status === "error" ? (
          <ErrorState message={res.message} onRetry={res.refresh} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="people-outline" title="Öğrenci bulunamadı" description={query ? "Aramanızla eşleşen öğrenci yok." : "Henüz size atanmış öğrenci yok."} />
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
