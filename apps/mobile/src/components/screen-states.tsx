import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/theme-context";

export function LoadingState({ label = "Yükleniyor…" }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
      <ActivityIndicator color={t.colors.primary} />
      <Text style={[styles.muted, { color: t.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
      <Text style={[styles.title, { color: t.colors.text }]}>{title}</Text>
      {description ? <Text style={[styles.muted, { color: t.colors.textMuted }]}>{description}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg }]}>
      <Text style={[styles.title, { color: t.colors.danger }]}>Bir şeyler ters gitti</Text>
      <Text style={[styles.muted, { color: t.colors.textMuted }]}>{message}</Text>
      {onRetry ? (
        <Text onPress={onRetry} style={[styles.retry, { color: t.colors.primary }]}>
          Tekrar dene
        </Text>
      ) : null}
    </View>
  );
}

/** Backend'e ulaşılamıyorsa (dev sırasında API_BASE_URL yanlış/kapalı) anlaşılır bir geliştirme ekranı. */
export function DevUnreachableState({ apiBaseUrl }: { apiBaseUrl: string }) {
  const t = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: t.colors.bg, padding: 24 }]}>
      <Text style={[styles.title, { color: t.colors.text }]}>Sunucuya ulaşılamıyor</Text>
      <Text style={[styles.muted, { color: t.colors.textMuted, textAlign: "center" }]}>
        {apiBaseUrl} adresine bağlanılamadı. Web uygulamasının (npm run dev) çalıştığından ve
        EXPO_PUBLIC_API_BASE_URL değerinin doğru olduğundan emin olun (bkz. README).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 16 },
  title: { fontSize: 16, fontWeight: "600" },
  muted: { fontSize: 13, marginTop: 4 },
  retry: { marginTop: 12, fontSize: 14, fontWeight: "600" },
});
