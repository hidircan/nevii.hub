import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { useLocale } from "../../i18n/locale-context";
import type { Lesson } from "../../types/api";
import {
  ATTENDANCE_LEGEND_CODES,
  attendanceStatusForLesson,
  attendanceStatusStyle,
  type AttendanceStatusCode,
} from "../../features/attendance/status-style";
import { AppText } from "./app-text";
import { Icon } from "./icon";
import { badgeColors, badgeStyles } from "./badge-style";

type Props = {
  lesson: Lesson;
  /** `sm`: yoğun listelerde (ders kartı başlığı) daha kompakt rozet. */
  size?: "sm" | "md";
};

/**
 * Yoklama statüsü rozeti — SALT OKUNUR. Öğretmen ve yönetici aynı
 * `features/attendance/status-style.ts` eşlemesini kullanır; renk tek başına
 * anlam taşımaz (ikon + etiket birlikte). Metin `numberOfLines={1}` ile
 * kırpılır, büyük yazı boyutunda satır taşmaz.
 */
export function AttendanceStatusBadge({ lesson, size = "sm" }: Props) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const style = attendanceStatusStyle(attendanceStatusForLesson(lesson));
  const c = badgeColors(t.colors, style.tone);
  return (
    <View
      style={[badgeStyles.pill, { backgroundColor: c.bg, paddingVertical: size === "sm" ? 3 : 4 }]}
      accessibilityLabel={tr(style.labelKey)}
    >
      <Icon name={style.icon} size={size === "sm" ? 12 : 14} color={c.fg} />
      <AppText
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[badgeStyles.text, { color: c.fg, fontSize: size === "sm" ? 12 : 14 }]}
      >
        {tr(style.labelKey)}
      </AppText>
    </View>
  );
}

/** Legend — yalnız renk değil, her statü ikon + etiketle açıklanır. */
export function AttendanceLegend() {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <View style={styles.legend}>
      <AppText style={[t.typography.compactCaption, { color: t.colors.textMuted }]} numberOfLines={1}>
        {tr("attStatus.legend")}
      </AppText>
      <View style={styles.legendItems}>
        {ATTENDANCE_LEGEND_CODES.map((code: AttendanceStatusCode) => {
          const style = attendanceStatusStyle(code);
          const c = badgeColors(t.colors, style.tone);
          return (
            <View key={code} style={styles.legendItem}>
              <Icon name={style.icon} size={12} color={c.fg} />
              <AppText style={[t.typography.compactCaption, { color: t.colors.textMuted }]} numberOfLines={1}>
                {tr(style.labelKey)}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { gap: 6, marginTop: 10, marginBottom: 2 },
  legendItems: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
});
