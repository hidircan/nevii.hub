import { StyleSheet, Text, View } from "react-native";
import { format } from "../../lib/date";
import { lessonStatusBadge } from "../../lib/lesson-status";
import { useTheme } from "../../theme/theme-context";
import { Card } from "./card";
import { Icon } from "./icon";
import { StatusBadge } from "./status-badge";
import type { Lesson } from "../../types/api";

type Props = {
  lesson: Lesson;
  /** Karşı taraf ismi — öğretmen ekranında öğrenci adı, veli/admin ekranında öğretmen adı. */
  personName: string;
  onPress?: () => void;
};

export function LessonCard({ lesson, personName, onPress }: Props) {
  const t = useTheme();
  const badge = lessonStatusBadge(lesson);
  const start = new Date(lesson.startAt);
  const end = new Date(lesson.endAt);

  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <View style={[styles.timeBlock, { backgroundColor: t.colors.primarySoft }]}>
          <Text style={[t.typography.cardTitle, { color: t.colors.primaryStrong }]}>{format(start, "HH:mm")}</Text>
          <Text style={[t.typography.caption, { color: t.colors.primaryStrong }]}>{format(end, "HH:mm")}</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>
              {personName}
            </Text>
            <StatusBadge label={badge.label} tone={badge.tone} />
          </View>
          <View style={styles.metaRow}>
            {lesson.instrument ? (
              <View style={styles.metaItem}>
                <Icon name="musical-notes-outline" size={13} color={t.colors.textMuted} />
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{lesson.instrument}</Text>
              </View>
            ) : null}
            {lesson.roomName ? (
              <View style={styles.metaItem}>
                <Icon name="location-outline" size={13} color={t.colors.textMuted} />
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{lesson.roomName}</Text>
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
