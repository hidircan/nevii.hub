import { StyleSheet, Text, View } from "react-native";
import { isPast, relativeDayLabel } from "../../lib/date";
import { useTheme } from "../../theme/theme-context";
import { useNow } from "../../hooks/use-now";
import { Card } from "./card";
import { Icon } from "./icon";
import { StatusBadge, type BadgeTone } from "./status-badge";
import type { Homework } from "../../types/api";

const STATUS_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Bekliyor", tone: "warning" },
  SUBMITTED: { label: "Teslim edildi", tone: "info" },
  REVIEWED: { label: "İncelendi", tone: "success" },
};

type Props = {
  homework: Homework;
  showStudentName?: boolean;
  onPress?: () => void;
};

export function HomeworkCard({ homework, showStudentName = true, onPress }: Props) {
  const t = useTheme();
  const now = useNow();
  const status = STATUS_MAP[homework.status ?? "PENDING"] ?? { label: homework.status ?? "Bekliyor", tone: "neutral" as BadgeTone };
  const overdue = homework.dueDate && homework.status !== "REVIEWED" && isPast(homework.dueDate, now);

  return (
    <Card onPress={onPress}>
      <View style={styles.headerRow}>
        <Text style={[t.typography.cardTitle, { color: t.colors.text, flex: 1 }]} numberOfLines={2}>
          {homework.title}
        </Text>
        <StatusBadge label={overdue ? "Gecikti" : status.label} tone={overdue ? "danger" : status.tone} />
      </View>
      <View style={styles.metaRow}>
        {showStudentName && homework.studentName ? (
          <View style={styles.metaItem}>
            <Icon name="person-outline" size={13} color={t.colors.textMuted} />
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{homework.studentName}</Text>
          </View>
        ) : null}
        {homework.dueDate ? (
          <View style={styles.metaItem}>
            <Icon name="calendar-outline" size={13} color={t.colors.textMuted} />
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
              {relativeDayLabel(new Date(homework.dueDate))}
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
});
