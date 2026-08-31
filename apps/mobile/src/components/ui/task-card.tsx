import { Pressable, StyleSheet, Text, View } from "react-native";
import { relativeDayLabel } from "../../lib/date";
import { useTheme } from "../../theme/theme-context";
import { Card } from "./card";
import { Icon } from "./icon";
import { StatusBadge, type BadgeTone } from "./status-badge";
import type { TaskItem } from "../../types/api";

const PRIORITY_MAP: Record<string, { label: string; tone: BadgeTone }> = {
  URGENT: { label: "Acil", tone: "danger" },
  HIGH: { label: "Yüksek", tone: "warning" },
  MEDIUM: { label: "Orta", tone: "info" },
  LOW: { label: "Düşük", tone: "neutral" },
};

type Props = {
  task: TaskItem;
  onPress?: () => void;
  onComplete?: () => void;
};

export function TaskCard({ task, onPress, onComplete }: Props) {
  const t = useTheme();
  const priority = task.priority ? PRIORITY_MAP[task.priority] ?? { label: task.priority, tone: "neutral" as BadgeTone } : null;
  const isDone = task.status === "COMPLETED" || task.status === "ARCHIVED";
  const overdue = !isDone && task.dueDate ? new Date(task.dueDate).getTime() < Date.now() : false;

  return (
    <Card onPress={onPress}>
      <View style={styles.row}>
        {onComplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDone ? "Tamamlandı" : "Tamamla"}
            onPress={onComplete}
            hitSlop={8}
            style={[
              styles.checkbox,
              { borderColor: isDone ? t.colors.success : t.colors.border, backgroundColor: isDone ? t.colors.success : "transparent" },
            ]}
          >
            {isDone ? <Icon name="checkmark" size={14} color={t.colors.primaryOn} /> : null}
          </Pressable>
        ) : null}

        <View style={styles.content}>
          <Text
            style={[t.typography.cardTitle, { color: t.colors.text, textDecorationLine: isDone ? "line-through" : "none" }]}
            numberOfLines={2}
          >
            {task.title}
          </Text>
          <View style={styles.metaRow}>
            {priority ? <StatusBadge label={priority.label} tone={priority.tone} /> : null}
            {task.category ? <StatusBadge label={task.category} tone="neutral" /> : null}
            {task.dueDate ? (
              <View style={styles.metaItem}>
                <Icon name="time-outline" size={13} color={overdue ? t.colors.danger : t.colors.textMuted} />
                <Text style={[t.typography.caption, { color: overdue ? t.colors.danger : t.colors.textMuted }]}>
                  {relativeDayLabel(new Date(task.dueDate))}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  content: { flex: 1, gap: 6 },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
});
