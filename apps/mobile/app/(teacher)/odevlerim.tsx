import { Text } from "react-native";
import { ListScreen } from "../../src/components/list-screen";
import { useApiGet } from "../../src/hooks/use-api";
import { fonts } from "../../src/theme/tokens";

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
          <Text style={{ fontFamily: fonts.serifBold, fontWeight: "700", fontSize: 17 }}>{h.title}</Text>
          {h.studentName ? <Text style={{ fontFamily: fonts.serif, marginTop: 2, fontSize: 15, opacity: 0.7 }}>{h.studentName}</Text> : null}
        </>
      )}
    />
  );
}
