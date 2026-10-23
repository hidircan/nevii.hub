import { AppText } from "./app-text";
import { StyleSheet, View } from "react-native";
import { format } from "../../lib/date";
import { lessonStatusBadge, studentFacingLessonStatus } from "../../lib/lesson-status";
import { useTheme } from "../../theme/theme-context";
import { Card } from "./card";
import { Icon } from "./icon";
import { StatusBadge } from "./status-badge";
import { AttendanceStatusBadge } from "./attendance-status-badge";
import type { Lesson } from "../../types/api";

type Props = {
  lesson: Lesson;
  /** Karşı taraf ismi — öğretmen ekranında öğrenci adı, veli/admin ekranında öğretmen adı. */
  personName: string;
  onPress?: () => void;
  /**
   * Öğretmen yüzeyinde `false` — yoklama durumu ne rozet ne CTA olarak
   * görünmez (öğretmen yoklama almaz); yerine şube adı gösterilir.
   */
  showStatus?: boolean;
  /**
   * Yoklama statüsü rozeti (SALT OKUNUR) — yönetici ve öğretmen ders
   * programı AYNI paylaşılan eşlemeyi kullanır (features/attendance/status-style).
   * `showStatus`'tan bağımsızdır; liste/detayda yoklama rengi isteniyorsa açılır.
   */
  showAttendance?: boolean;
  /** Öğrenci/veli yüzeyi — "Yoklama bekliyor" yerine nötr metin. */
  studentFacing?: boolean;
};

export function LessonCard({ lesson, personName, onPress, showStatus = true, showAttendance = false, studentFacing = false }: Props) {
  const t = useTheme();
  const badge = studentFacing ? studentFacingLessonStatus(lesson) : lessonStatusBadge(lesson);
  const start = new Date(lesson.startAt);
  const end = new Date(lesson.endAt);

  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <View style={[styles.timeBlock, { backgroundColor: t.colors.bgMuted }]}>
          <AppText style={[t.typography.cardTitle, { color: t.colors.text }]}>{format(start, "HH:mm")}</AppText>
          <AppText style={[t.typography.caption, { color: t.colors.text }]}>{format(end, "HH:mm")}</AppText>
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <AppText style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>
              {personName}
            </AppText>
            {showAttendance ? (
              <AttendanceStatusBadge lesson={lesson} />
            ) : showStatus ? (
              <StatusBadge label={badge.label} tone={badge.tone} />
            ) : null}
          </View>
          <View style={styles.metaRow}>
            {lesson.instrument ? (
              <View style={styles.metaItem}>
                <Icon name="musical-notes-outline" size={13} color={t.colors.textMuted} />
                <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{lesson.instrument}</AppText>
              </View>
            ) : null}
            {lesson.branchName ? (
              <View style={styles.metaItem}>
                <Icon name="business-outline" size={13} color={t.colors.textMuted} />
                <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{lesson.branchName}</AppText>
              </View>
            ) : null}
            {lesson.roomName ? (
              <View style={styles.metaItem}>
                <Icon name="location-outline" size={13} color={t.colors.textMuted} />
                <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{lesson.roomName}</AppText>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  timeBlock: { width: 56, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  content: { flex: 1, gap: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  metaRow: { flexDirection: "row", gap: 12 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
});
