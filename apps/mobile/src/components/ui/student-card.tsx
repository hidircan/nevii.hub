import { StyleSheet, Text, View } from "react-native";
import { useLocale } from "../../i18n/locale-context";
import { format } from "../../lib/date";
import { useTheme } from "../../theme/theme-context";
import { Avatar } from "./avatar";
import { Card } from "./card";
import { StatusBadge } from "./status-badge";
import type { StudentSummary } from "../../types/api";

type Props = {
  student: StudentSummary;
  onPress?: () => void;
};

function scoreTone(score: number): "success" | "info" | "warning" {
  if (score >= 80) return "success";
  if (score >= 55) return "info";
  return "warning";
}

export function StudentCard({ student, onPress }: Props) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const subtitleParts = [student.studentType, student.instrument, student.level].filter(Boolean);

  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        <Avatar name={student.name} photoPath={student.photoPath} />
        <View style={styles.content}>
          <Text style={[t.typography.cardTitle, { color: t.colors.text }]} numberOfLines={1}>
            {student.name}
          </Text>
          {subtitleParts.length > 0 ? (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
              {subtitleParts.join(" · ")}
            </Text>
          ) : null}
          <View style={styles.badgeRow}>
            {typeof student.score === "number" ? (
              <StatusBadge label={tr("cards.score", { n: student.score })} tone={scoreTone(student.score)} />
            ) : null}
            {student.nextLessonAt ? (
              <StatusBadge label={tr("cards.nextLesson", { t: format(new Date(student.nextLessonAt), "HH:mm") })} tone="info" />
            ) : null}
            {student.homeworkPendingCount ? (
              <StatusBadge label={tr("ui.pendingHomework", { n: student.homeworkPendingCount })} tone="warning" />
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  content: { flex: 1, gap: 4 },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" },
});
