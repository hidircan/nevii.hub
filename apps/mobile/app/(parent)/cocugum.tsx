import { Text } from "react-native";
import { format } from "../../src/lib/date";
import { ListScreen } from "../../src/components/list-screen";
import { useApiGet } from "../../src/hooks/use-api";
import { useAuth } from "../../src/auth/auth-context";
import { PlaceholderScreen } from "../../src/components/placeholder-screen";

type Lesson = { id: string; teacherName?: string; startAt: string; endAt: string; status: string };
type ScheduleResponse = { lessons: Lesson[] };

export default function ParentCocugum() {
  const { user } = useAuth();
  const res = useApiGet<ScheduleResponse>(user?.studentId ? `/api/v1/students/${user.studentId}/schedule` : "");

  if (!user?.studentId) {
    return (
      <PlaceholderScreen
        title="Çocuğumun dersleri"
        note="Bu hesapta bir studentId claim'i yok — veli/öğrenci portal girişi bekleniyor (bkz. README: STUDENT rolü GUARDIAN/SELF ayrımı JWT'de yok)."
      />
    );
  }

  return (
    <ListScreen
      title="Çocuğumun dersleri"
      status={res.status}
      data={res.status === "success" ? res.data.lessons : undefined}
      errorMessage={res.status === "error" ? res.message : undefined}
      onRetry={res.refresh}
      emptyLabel="Planlanmış ders yok."
      keyExtractor={(l) => l.id}
      renderItem={(l) => (
        <>
          <Text style={{ fontWeight: "700", fontSize: 15 }}>{l.teacherName ?? "Öğretmen"}</Text>
          <Text style={{ marginTop: 2, fontSize: 13, opacity: 0.7 }}>
            {format(new Date(l.startAt), "yyyy-MM-dd")} {format(new Date(l.startAt), "HH:mm")}–{format(new Date(l.endAt), "HH:mm")} · {l.status}
          </Text>
        </>
      )}
    />
  );
}
