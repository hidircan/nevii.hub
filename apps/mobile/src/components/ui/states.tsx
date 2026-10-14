import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";
import { Button } from "./button";
import { Icon } from "./icon";

export function LoadingState({ label }: { label?: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={t.colors.primary} />
      <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 10 }]}>{label ?? tr("ui.loading")}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry, code }: { message: string; onRetry?: () => void; code?: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  // FORBIDDEN/NOT_FOUND are access-scope facts, not failures — retrying won't
  // change them, so they get a neutral tone instead of the danger-red generic error.
  const isAccessScope = code === "FORBIDDEN" || code === "NOT_FOUND";
  return (
    <View style={styles.center}>
      <View style={[styles.iconWrap, { backgroundColor: isAccessScope ? t.colors.bgMuted : t.colors.dangerSoft }]}>
        <Icon
          name={isAccessScope ? "lock-closed-outline" : "alert-circle-outline"}
          size={26}
          color={isAccessScope ? t.colors.textMuted : t.colors.danger}
        />
      </View>
      <Text style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 14 }]}>
        {isAccessScope ? tr("ui.noAccess") : tr("ui.wentWrong")}
      </Text>
      <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 4, textAlign: "center" }]}>
        {message}
      </Text>
      {onRetry && !isAccessScope ? (
        <Button label={tr("ui.retry")} onPress={onRetry} variant="secondary" size="sm" fullWidth={false} style={{ marginTop: 16 }} />
      ) : null}
    </View>
  );
}

/** Backend'e ulaşılamıyorsa (dev sırasında API_BASE_URL yanlış/kapalı) anlaşılır bir geliştirme ekranı. */
export function DevUnreachableState({ apiBaseUrl }: { apiBaseUrl: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <View style={[styles.center, { padding: 24 }]}>
      <Icon name="cloud-offline-outline" size={26} color={t.colors.textMuted} />
      <Text style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 14 }]}>{tr("ui.unreachableTitle")}</Text>
      <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6, textAlign: "center" }]}>
        {tr("ui.unreachableBody", { url: apiBaseUrl })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
