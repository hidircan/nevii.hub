import { StyleSheet, Text, View } from "react-native";
import { useLocale } from "../../i18n/locale-context";
import { shortDayMonth } from "../../lib/date";
import { useTheme } from "../../theme/theme-context";
import { Card } from "./card";
import { Icon } from "./icon";
import { StatusBadge } from "./status-badge";
import type { Announcement, AnnouncementAudienceType } from "../../types/api";

const AUDIENCE_KEY: Record<AnnouncementAudienceType, string> = {
  all: "audience.all",
  branch: "audience.branch",
  teachers: "audience.teachers",
  parents: "audience.parents",
  students: "audience.students",
  studentType: "audience.studentType",
  instrument: "audience.instrument",
  selected: "audience.selected",
};

type Props = {
  announcement: Announcement;
  onPress?: () => void;
};

export function AnnouncementCard({ announcement, onPress }: Props) {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <Card onPress={onPress}>
      <View style={styles.headerRow}>
        {announcement.pinned ? <Icon name="pin" size={14} color={t.colors.primary} /> : null}
        <Text style={[t.typography.cardTitle, { color: t.colors.text, flex: 1 }]} numberOfLines={1}>
          {announcement.title}
        </Text>
      </View>
      <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6 }]} numberOfLines={2}>
        {announcement.body}
      </Text>
      <View style={styles.footerRow}>
        <StatusBadge label={tr(AUDIENCE_KEY[announcement.audienceType])} tone="info" />
        <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>
          {shortDayMonth(new Date(announcement.createdAt))}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
});
