import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../api/client";
import { useAuth } from "../../auth/auth-context";
import { AppHeader, Button, Card, Screen, TextField } from "../../components/ui";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * E-posta değiştirme — öğrenci/veli/öğretmen için ortak.
 *
 * Güvenlik (sunucu zorunlu kılar, istemci yalnız UX):
 * - Yalnız KENDİ hesabı (`ctx.userId` session'dan; body'de hedef YOK).
 * - Mevcut şifre ile yeniden doğrulama ZORUNLU.
 * - Benzersizlik + format backend'de doğrulanır; hata mesajları hesap
 *   varlığını sızdırmayacak şekilde backend metinleriyle gösterilir.
 * - Onay, yeni adrese giden tek kullanımlık bağlantıyla olur (24s TTL);
 *   bağlantı web'de açılır — uygulama token işlemez.
 * - Session/token etkisi YOK (oturumlar userId tabanlı); görüntülenen adres
 *   bir sonraki girişte güncellenir. Onaylanana kadar eski adres geçerlidir.
 */
export function ChangeEmailScreen() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const { user } = useAuth();

  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const canSubmit =
    isEmailLike(newEmail) &&
    newEmail.trim().toLowerCase() !== (user?.email ?? "").trim().toLowerCase() &&
    currentPassword.length > 0 &&
    !busy;

  async function onSubmit() {
    setTouched(true);
    setError(null);
    if (!canSubmit) return;
    setBusy(true);
    const res = await apiPost<{ requested: boolean }>("/api/v1/account/email-change/request", {
      currentPassword,
      newEmail: newEmail.trim(),
    });
    setBusy(false);
    setCurrentPassword("");
    if (!res.ok) {
      setError(res.error.message || tr("emailChange.failed"));
      return;
    }
    setSentTo(newEmail.trim());
    setNewEmail("");
    setTouched(false);
  }

  if (sentTo) {
    return (
      <Screen>
        <AppHeader title={tr("account.changeEmail")} showBack showNotifications={false} />
        <Card>
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("emailChange.sentTitle")}</Text>
          <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 8 }]}>
            {tr("emailChange.sentBody", { email: sentTo })}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button label={tr("emailChange.resendOther")} variant="secondary" onPress={() => setSentTo(null)} />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={tr("account.changeEmail")} showBack showNotifications={false} />

      <Card>
        <Text style={[t.typography.caption, { color: t.colors.textFaint }]}>{tr("emailChange.currentEmail")}</Text>
        <Text style={[t.typography.bodyStrong, { color: t.colors.text, marginTop: 2 }]} numberOfLines={1}>
          {user?.email ?? "—"}
        </Text>
      </Card>

      <View style={{ gap: 14, marginTop: 16 }}>
        <TextField
          label={tr("account.newEmail")}
          value={newEmail}
          onChangeText={(v) => {
            setNewEmail(v);
            if (error) setError(null);
          }}
          placeholder="yeni@adres.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          error={
            touched && !isEmailLike(newEmail)
              ? tr("emailChange.invalid")
              : touched && newEmail.trim().toLowerCase() === (user?.email ?? "").trim().toLowerCase()
                ? tr("emailChange.sameAsCurrent")
                : undefined
          }
        />

        <TextField
          label={tr("account.currentPassword")}
          value={currentPassword}
          onChangeText={(v) => {
            setCurrentPassword(v);
            if (error) setError(null);
          }}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
        />

        {error ? (
          <View accessibilityLiveRegion="polite" style={{ borderRadius: 10, padding: 12, backgroundColor: t.colors.dangerSoft }}>
            <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        <Button label={busy ? tr("emailChange.sending") : tr("emailChange.sendLink")} onPress={onSubmit} disabled={!canSubmit} loading={busy} />

        <Text style={[t.typography.caption, { color: t.colors.textFaint, textAlign: "center" }]}>
          {tr("emailChange.footnote")}
        </Text>
      </View>
    </Screen>
  );
}
