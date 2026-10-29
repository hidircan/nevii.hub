import { AppText } from "./ui/app-text";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useLocale } from "../i18n/locale-context";
import { useTheme } from "../theme/theme-context";
import { fonts } from "../theme/tokens";

export function LoadingState({ label }: { label?: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
      <ActivityIndicator color={t.colors.primary} />
      <AppText style={[styles.muted, { color: t.colors.textMuted }]}>{label ?? tr("ui.loading")}</AppText>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
      <AppText style={[styles.title, { color: t.colors.text }]}>{title}</AppText>
      {description ? <AppText style={[styles.muted, { color: t.colors.textMuted }]}>{description}</AppText> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
      <AppText style={[styles.title, { color: t.colors.danger }]}>{tr("ui.wentWrong")}</AppText>
      <AppText style={[styles.muted, { color: t.colors.textMuted }]}>{message}</AppText>
      {onRetry ? (
        <AppText onPress={onRetry} style={[styles.retry, { color: t.colors.primary }]}>
          {tr("ui.retry")}
        </AppText>
      ) : null}
    </View>
  );
}

/** Backend'e ulaşılamıyorsa (dev sırasında API_BASE_URL yanlış/kapalı) anlaşılır bir geliştirme ekranı. */
export function DevUnreachableState({ apiBaseUrl }: { apiBaseUrl: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg, padding: 24 }]}>
      <AppText style={[styles.title, { color: t.colors.text }]}>{tr("ui.unreachableTitle")}</AppText>
      <AppText style={[styles.muted, { color: t.colors.textMuted, textAlign: "center" }]}>
        {tr("ui.unreachableBody", { url: apiBaseUrl })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  title: { fontFamily: fonts.bold, fontSize: 18, fontWeight: "600" },
  muted: { fontFamily: fonts.regular, fontSize: 15, marginTop: 4 },
  retry: { marginTop: 12, fontFamily: fonts.bold, fontSize: 16, fontWeight: "600" },
});
