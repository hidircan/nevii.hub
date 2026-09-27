import { useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/auth-context";
import { BrandMark, Button, Icon, TextField } from "../src/components/ui";
import { useLocale } from "../src/i18n/locale-context";
import { useTheme } from "../src/theme/theme-context";

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Giriş — persona parametresi YALNIZ UX yönlendirmesi/başlık/yardımcı içerik
 * içindir; backend tek login endpoint'i kullanır (`/api/v1/auth/login`).
 * Geri dönüş: karşılama sayfasına (replace — geri yığınında döngü yok).
 * Hata dili sakin ve sızdırmaz: yanlış bilgi / bağlantı sorunu ayrımı
 * AuthProvider mesajlarından gelir, burada yeniden yorumlanmaz.
 */
export default function LoginScreen() {
  const { status, login } = useAuth();
  const t = useTheme();
  const router = useRouter();
  const { persona } = useLocalSearchParams<{ persona?: string }>();
  const { t: tr } = useLocale();
  const heading =
    persona === "teacher"
      ? tr("auth.loginHeadingTeacher")
      : persona === "admin"
        ? tr("auth.loginHeadingAdmin")
        : tr("auth.loginHeadingStudent");
  const subheading =
    persona === "teacher"
      ? tr("auth.loginSubTeacher")
      : persona === "admin"
        ? tr("auth.loginSubAdmin")
        : tr("auth.loginSubStudent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signedIn") return <Redirect href="/" />;

  const emailValid = email.trim().length === 0 || isEmailLike(email);
  const canSubmit = isEmailLike(email) && password.length > 0 && !busy;

  async function onSubmit() {
    setTouched(true);
    setError(null);
    if (!isEmailLike(email) || password.length === 0) return;
    setBusy(true);
    const res = await login(email.trim(), password);
    setBusy(false);
    if (!res.ok) setError(res.message);
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("login.backToHome")}
            onPress={() => router.replace("/welcome")}
            hitSlop={12}
            style={styles.backRow}
          >
            <Icon name="chevron-back" size={18} color={t.colors.textMuted} />
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("login.home")}</Text>
          </Pressable>

          <BrandMark size="md" />
          <Text accessibilityRole="header" style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 14, textAlign: "center" }]}>
            {heading}
          </Text>
          <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6, textAlign: "center" }]}>
            {subheading}
          </Text>

          <View style={styles.form}>
            <TextField
              label={tr("auth.email")}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (error) setError(null);
              }}
              placeholder={tr("auth.emailPlaceholder")}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              error={touched && !emailValid ? tr("login.emailHint") : undefined}
            />

            <View>
              <TextField
                label={tr("auth.password")}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (error) setError(null);
                }}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? tr("auth.hidePassword") : tr("auth.showPassword")}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={12}
                style={styles.eyeButton}
              >
                <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={t.colors.textMuted} />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr("auth.forgotPassword")}
              onPress={() => router.push("/forgot-password")}
              hitSlop={8}
              style={styles.forgotLink}
            >
              <Text style={[t.typography.caption, { color: t.colors.primary }]}>{tr("auth.forgotPassword")}</Text>
            </Pressable>

            {error ? (
              <View
                accessibilityLiveRegion="polite"
                style={[styles.errorBox, { backgroundColor: t.colors.dangerSoft }]}
              >
                <Icon name="alert-circle" size={16} color={t.colors.danger} />
                <Text style={[t.typography.caption, { color: t.colors.danger, flex: 1 }]}>{error}</Text>
              </View>
            ) : null}

            <Button label={busy ? tr("auth.loggingIn") : tr("auth.loginButton")} onPress={onSubmit} disabled={!canSubmit} loading={busy} />
          </View>

          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 24, textAlign: "center" }]}>
            {tr("login.footnote")}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", paddingVertical: 8, marginBottom: 8 },
  form: { gap: 14, marginTop: 28 },
  eyeButton: { position: "absolute", right: 6, bottom: 2, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  forgotLink: { alignSelf: "flex-end" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 12 },
});
