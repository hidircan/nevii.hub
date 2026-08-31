import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiPost } from "../src/api/client";
import { Button, Icon, TextField } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

/**
 * Şifre sıfırlama — `forgot-password` ekranından gelen 8 karakterlik kod (varsa
 * `code` parametresiyle önceden doldurulur) + yeni şifre. `/api/v1/auth/reset-password`
 * (public) kod geçersiz/süresi dolmuş/kullanılmışsa AYNI jenerik mesajı döner — bu
 * ekran hangisi olduğunu ayırt etmeye ÇALIŞMAZ, backend'in mesajını doğrudan gösterir.
 */
export default function ResetPasswordScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();

  const [code, setCode] = useState(params.code ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = code.trim().length >= 6 && newPassword.length >= 8 && newPassword === confirmPassword && !busy;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/v1/auth/reset-password", { token: code.trim(), newPassword });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || "Şifre sıfırlanamadı.");
      return;
    }
    setDone(true);
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.content}>
          {!done ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Geri" onPress={() => router.back()} hitSlop={8} style={styles.backButton}>
              <Icon name="chevron-back" size={22} color={t.colors.text} />
            </Pressable>
          ) : null}

          <View style={[styles.logo, { backgroundColor: done ? t.colors.successSoft : t.colors.primarySoft }]}>
            <Icon name={done ? "checkmark-circle" : "lock-open-outline"} size={28} color={done ? t.colors.success : t.colors.primary} />
          </View>

          {done ? (
            <>
              <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 20 }]}>Şifreniz güncellendi</Text>
              <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 8, marginBottom: 28 }]}>
                Yeni şifrenizle giriş yapabilirsiniz.
              </Text>
              <Button label="Girişe dön" onPress={() => router.replace("/login")} />
            </>
          ) : (
            <>
              <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 20 }]}>Yeni şifre belirle</Text>
              <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 4, marginBottom: 24 }]}>
                E-postanıza gönderilen 8 karakterli kodu ve yeni şifrenizi girin.
              </Text>

              <View style={styles.form}>
                <TextField
                  label="Sıfırlama kodu"
                  value={code}
                  onChangeText={setCode}
                  placeholder="ör. AB3D9F2K"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <TextField
                  label="Yeni şifre"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="En az 8 karakter"
                />
                <TextField
                  label="Yeni şifre (tekrar)"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  error={mismatch ? "Şifreler eşleşmiyor" : undefined}
                />

                {error ? (
                  <View style={[styles.errorBox, { backgroundColor: t.colors.dangerSoft }]}>
                    <Icon name="alert-circle" size={16} color={t.colors.danger} />
                    <Text style={[t.typography.caption, { color: t.colors.danger, flex: 1 }]}>{error}</Text>
                  </View>
                ) : null}

                <Button label="Şifreyi güncelle" onPress={onSubmit} disabled={!canSubmit} loading={busy} style={{ marginTop: 8 }} />
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
});
