import { AppText } from "../../src/components/ui/app-text";

import { ListScreen } from "../../src/components/list-screen";
import { useApiGet } from "../../src/hooks/use-api";
import { useLocale } from "../../src/i18n/locale-context";
import { fonts } from "../../src/theme/tokens";

type Homework = { id: string; title: string; studentName?: string; dueDate?: string };
type HomeworkResponse = { homework: Homework[] };

export default function TeacherOdevlerim() {
  const { t: tr } = useLocale();
  const res = useApiGet<HomeworkResponse>("/api/v1/homework/mine");
  return (
    <ListScreen
      title={tr("lists.myHwTitle")}
      status={res.status}
      data={res.status === "success" ? res.data.homework : undefined}
      errorMessage={res.status === "error" ? res.message : undefined}
      onRetry={res.refresh}
      emptyLabel={tr("lists.myHwEmpty")}
      keyExtractor={(h) => h.id}
      renderItem={(h) => (
        <>
          <AppText style={{ fontFamily: fonts.bold, fontWeight: "700", fontSize: 17 }}>{h.title}</AppText>
          {h.studentName ? <AppText style={{ fontFamily: fonts.regular, marginTop: 2, fontSize: 15, opacity: 0.7 }}>{h.studentName}</AppText> : null}
        </>
      )}
    />
  );
}
