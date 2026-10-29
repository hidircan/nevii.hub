import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiPost } from "../src/api/client";
import { Button, Icon, TextField, AppText } from "../src/components/ui";
import { useLocale } from "../src/i18n/locale-context";
import { useTheme } from "../src/theme/theme-context";

type ForgotPasswordResponse = { message: string; devResetToken?: string };

/**
 * Şifremi unuttum — e-posta girişi. Backend her zaman AYNI nötr mesajı döner (hesap
 * var/yok fark etmeksizin) — bu ekran de bunu birebir yansıtır, "hesap bulunamadı"
 * gibi bir dal YOKTUR. `devResetToken` yalnızca development build'de (backend
 * NODE_ENV !== production kontrolü) döner — gerçek bir e-posta sağlayıcı bu kod
 * tabanında henüz yok.
 */
export default function ForgotPasswordScreen() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<ForgotPasswordResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const res = await apiPost<ForgotPasswordResponse>("/api/v1/auth/forgot-password", { email: email.trim() });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || tr("forgot.failed"));
      return;
    }
    setSent(res.data);
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.content}>
          <Pressable accessibilityRole="button" accessibilityLabel={tr("common.back")} onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
            <Icon name="chevron-back" size={22} color={t.colors.text} />
          </Pressable>

          <View style={[styles.logo, { backgroundColor: t.colors.primarySoft }]}>
            <Icon name="key-outline" size={28} color={t.colors.primary} />
          </View>
          <AppText style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 20 }]}>{tr("forgot.title")}</AppText>

          {sent ? (
            <>
              <AppText style={[t.typography.body, { color: t.colors.textMuted, marginTop: 8, marginBottom: 28 }]}>
                {sent.message}
              </AppText>

              {sent.devResetToken ? (
                <View style={[styles.devBox, { backgroundColor: t.colors.warningSoft, borderColor: t.colors.warning }]}>
                  <AppText style={[t.typography.caption, { color: t.colors.warning, fontFamily: t.fonts.bold, fontWeight: "700" }]}>
                    {tr("forgot.devOnly")}
                  </AppText>
                  <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                    {tr("forgot.devHint")}
                  </AppText>
                  <AppText style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 8, letterSpacing: 2 }]}>
                    {sent.devResetToken}
                  </AppText>
                </View>
              ) : null}

              <Button
                label={tr("forgot.enterCode")}
                onPress={() =>
                  router.replace({ pathname: "/reset-password", params: sent.devResetToken ? { code: sent.devResetToken } : {} })
                }
                style={{ marginTop: sent.devResetToken ? 16 : 8 }}
              />
              <Button label={tr("forgot.backToLogin")} variant="ghost" onPress={() => router.replace("/login")} style={{ marginTop: 8 }} />
            </>
          ) : (
            <>
              <AppText style={[t.typography.body, { color: t.colors.textMuted, marginTop: 4, marginBottom: 28 }]}>
                {tr("forgot.hint")}
              </AppText>

              <View style={styles.form}>
                <TextField
                  label={tr("auth.email")}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={tr("auth.emailPlaceholder")}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                />

                {error ? (
                  <View style={[styles.errorBox, { backgroundColor: t.colors.dangerSoft }]}>
                    <Icon name="alert-circle" size={16} color={t.colors.danger} />
                    <AppText style={[t.typography.caption, { color: t.colors.danger, flex: 1 }]}>{error}</AppText>
                  </View>
                ) : null}

                <Button label={tr("forgot.sendCode")} onPress={onSubmit} disabled={!email.includes("@")} loading={busy} style={{ marginTop: 8 }} />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  backButton: { position: "absolute", top: 8, left: 8, padding: 8 },
  logo: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  form: { gap: 16, marginTop: 8 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 12 },
  devBox: { borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 4 },
});
