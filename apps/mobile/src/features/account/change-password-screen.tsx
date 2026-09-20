import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../api/client";
import { AppHeader, Button, Screen, TextField } from "../../components/ui";
import { useTheme } from "../../theme/theme-context";

/**
 * Şifre değiştirme — TÜM roller için ortak (Öğretmen/Öğrenci/Veli/Admin).
 * `/api/v1/auth/change-password` (changeOwnPasswordTool) kimliği doğrulanmış
 * HERHANGİ bir rolü kabul eder ve HER ZAMAN yalnızca çağıranın kendi
 * `ctx.userId`'sini değiştirir — body'de hedef kullanıcı kimliği YOKTUR,
 * bu yüzden başka bir kullanıcının şifresini değiştirmek yapısal olarak
 * mümkün değildir. Şifre hiçbir yerde (hata mesajı dahil) loglanmaz.
 */
export function ChangePasswordScreen() {
  const t = useTheme();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword && !busy;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/v1/auth/change-password", { currentPassword, newPassword });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || "Şifre değiştirilemedi.");
      return;
    }
    setDone(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <Screen>
      <AppHeader title="Şifre değiştir" showBack showNotifications={false} />

      <View style={{ gap: 16 }}>
        <TextField
          label="Mevcut şifre"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry
          autoCapitalize="none"
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

        {error ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text> : null}
        {done ? <Text style={[t.typography.caption, { color: t.colors.success }]}>Şifreniz güncellendi.</Text> : null}

        <Button label="Şifreyi güncelle" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
      </View>
    </Screen>
  );
}
