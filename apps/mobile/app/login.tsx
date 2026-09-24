import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/auth-context";
import { Button, Icon, TextField } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

export default function LoginScreen() {
  const { status, login, notice } = useAuth();
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "signedIn") return <Redirect href="/" />;

  async function submit(takeover: boolean) {
    setBusy(true);
    setError(null);
    const res = await login(email.trim(), password, takeover);
    setBusy(false);
    if (res.ok) return;
    if (res.takeoverRequired) {
      // Tek aktif oturum: web ile aynı onay — vazgeçilirse diğer cihaz etkilenmez.
      Alert.alert("Bu hesap başka bir cihazda açık", res.message, [
        { text: "Vazgeç", style: "cancel" },
        { text: "Devam et ve diğer oturumu kapat", style: "destructive", onPress: () => void submit(true) },
      ]);
      return;
    }
    setError(res.message);
  }

  function onSubmit() {
    void submit(false);
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.content}>
          <View style={[styles.logo, { backgroundColor: t.colors.primarySoft }]}>
            <Icon name="musical-notes" size={30} color={t.colors.primary} />
          </View>
          <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 20 }]}>Nevii Hub</Text>
          <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 4, marginBottom: 32 }]}>
            Kurumunuzun hesabıyla giriş yapın
          </Text>

          <View style={styles.form}>
            <TextField
              label="E-posta"
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@kurum.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
            />

            <View>
              <TextField
                label="Şifre"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                style={styles.eyeButton}
              >
                <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={19} color={t.colors.textMuted} />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/forgot-password")}
              hitSlop={8}
              style={styles.forgotLink}
            >
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Şifremi unuttum</Text>
            </Pressable>

            {notice && !error ? (
              <View style={[styles.errorBox, { backgroundColor: t.colors.primarySoft }]}>
                <Icon name="information-circle" size={16} color={t.colors.primary} />
                <Text style={[t.typography.caption, { color: t.colors.text, flex: 1 }]}>{notice}</Text>
              </View>
            ) : null}

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: t.colors.dangerSoft }]}>
                <Icon name="alert-circle" size={16} color={t.colors.danger} />
                <Text style={[t.typography.caption, { color: t.colors.danger, flex: 1 }]}>{error}</Text>
              </View>
            ) : null}

            <Button
              label="Giriş yap"
              onPress={onSubmit}
              disabled={!email || !password}
              loading={busy}
              style={{ marginTop: 8 }}
            />
          </View>

          <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 24, textAlign: "center" }]}>
            Giriş bilgilerinizi kurumunuzun yöneticisinden alabilirsiniz.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  logo: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  form: { gap: 16, marginTop: 8 },
  eyeButton: { position: "absolute", right: 14, bottom: 12 },
  forgotLink: { alignSelf: "flex-end", marginTop: -4 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, padding: 12 },
});
