import { Text } from "react-native";
import { ListScreen } from "../../src/components/list-screen";
import { useApiGet } from "../../src/hooks/use-api";

type Homework = { id: string; title: string; studentName?: string; dueDate?: string };
type HomeworkResponse = { homework: Homework[] };

export default function TeacherOdevlerim() {
  const res = useApiGet<HomeworkResponse>("/api/v1/homework/mine");
  return (
    <ListScreen
      title="Ödevlerim"
      status={res.status}
      data={res.status === "success" ? res.data.homework : undefined}
      errorMessage={res.status === "error" ? res.message : undefined}
      onRetry={res.refresh}
      emptyLabel="Henüz ödev yok."
      keyExtractor={(h) => h.id}
      renderItem={(h) => (
        <>
          <Text style={{ fontWeight: "700", fontSize: 15 }}>{h.title}</Text>
          {h.studentName ? <Text style={{ marginTop: 2, fontSize: 13, opacity: 0.7 }}>{h.studentName}</Text> : null}
        </>
      )}
    />
  );
}
