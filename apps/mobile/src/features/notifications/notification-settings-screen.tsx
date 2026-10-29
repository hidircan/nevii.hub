import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { apiPatch, apiPost } from "../../api/client";
import { useAuth } from "../../auth/auth-context";
import { AppHeader, Button, Card, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, AppText } from "../../components/ui";
import { registerDeviceForPush } from "../../push/expo-push-deps";
import { useLocale } from "../../i18n/locale-context";
import { lookup } from "../../i18n/locales";
import { getActiveLocale } from "../../i18n/locale-store";
import { useApiGet } from "../../hooks/use-api";
import { useTheme } from "../../theme/theme-context";
import { categoryLabel } from "./categories";

type PreferenceRow = { category: string; inAppEnabled: boolean; pushEnabled: boolean };
type PreferencesResponse = { preferences: PreferenceRow[] };

export function NotificationSettingsScreen() {
  const t = useTheme();
  const { t: tr } = useLocale();
  useAuth();
  const res = useApiGet<PreferencesResponse>("/api/v1/notification-preferences");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  const rows = useMemo(() => (res.status === "success" ? res.data.preferences : []), [res]);
  const pushOn = rows.some((row) => row.pushEnabled);

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("notifications.settings")} showBack showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("notifications.settings")} showBack showNotifications={false} />
        <ErrorState message={res.message} onRetry={res.refresh} />
      </Screen>
    );
  }

  async function toggle(category: string, current: boolean) {
    setSaveError(null);
    setPending((p) => ({ ...p, [category]: true }));
    const patchRes = await apiPatch<PreferencesResponse>("/api/v1/notification-preferences", {
      updates: [{ category, inAppEnabled: !current }],
    });
    setPending((p) => ({ ...p, [category]: false }));
    if (!patchRes.ok) {
      setSaveError(patchRes.error.message || tr("notifSettings.saveFailed"));
      return;
    }
    res.refresh();
  }

  /**
   * Anlık (push) bildirim ana anahtarı — tüm kategoriler için pushEnabled.
   * Açmadan önce cihaz izni istenir/kayıt tazelenir; izin reddedilirse
   * sunucuya yazılmaz (dürüst durum: `notifications.pushDisabledHint`).
   * Sunucuda push altyapısı kapalıysa yanıt `pushEnabled=false` döner ve
   * kullanıcıya "henüz etkin değil" notu gösterilir — sahte başarı YOK.
   */
  async function togglePush(next: boolean) {
    if (pushBusy || rows.length === 0) return;
    setPushNotice(null);
    setPushBusy(true);
    if (next) {
      const reg = await registerDeviceForPush();
      if (reg.status === "denied") {
        setPushBusy(false);
        setPushNotice(tr("notifications.pushDisabledHint"));
        return;
      }
    }
    const patchRes = await apiPatch<PreferencesResponse>("/api/v1/notification-preferences", {
      updates: rows.map((row) => ({ category: row.category, inAppEnabled: row.inAppEnabled, pushEnabled: next })),
    });
    setPushBusy(false);
    if (!patchRes.ok) {
      setPushNotice(patchRes.error.message || tr("notifSettings.saveFailed"));
      return;
    }
    if (next && !patchRes.data.preferences.some((p) => p.pushEnabled)) {
      setPushNotice(tr("notifSettings.pushUnavailable"));
    }
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title={tr("notifications.settings")} showBack showNotifications={false} />
      {/* Push ana anahtarı — kategori bazlı `pushEnabled` alanlarını birlikte açar/kapatır. */}
      <Card style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <AppText style={[t.typography.body, { color: t.colors.text }]} numberOfLines={1}>
              {tr("notifications.pushEnabled")}
            </AppText>
            <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {pushOn ? tr("notifSettings.pushOnHint") : tr("notifSettings.pushOffHint")}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: pushOn, disabled: pushBusy || rows.length === 0 }}
            accessibilityLabel={tr("notifications.pushEnabled")}
            disabled={pushBusy || rows.length === 0}
            onPress={() => togglePush(!pushOn)}
            hitSlop={8}
            style={{ opacity: pushBusy ? 0.6 : 1 }}
          >
            <Icon
              name={pushOn ? "toggle" : "toggle-outline"}
              size={32}
              color={pushOn ? t.colors.primary : t.colors.textFaint}
            />
          </Pressable>
        </View>
        {pushNotice ? (
          <AppText style={[t.typography.caption, { color: t.colors.danger, marginTop: 8 }]}>{pushNotice}</AppText>
        ) : null}
      </Card>
      {rows.length === 0 ? (
        <Card>
          <AppText style={[t.typography.body, { color: t.colors.textMuted }]}>{tr("notifSettings.empty")}</AppText>
        </Card>
      ) : (
        <Card>
          {saveError ? (
            <AppText style={[t.typography.caption, { color: t.colors.danger, marginBottom: 8 }]}>{saveError}</AppText>
          ) : null}
          {rows.map((row, i) => (
            <View key={row.category}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: t.colors.divider, marginVertical: 12 }} /> : null}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  opacity: pending[row.category] ? 0.6 : 1,
                }}
              >
                <AppText style={[t.typography.body, { color: t.colors.text, flex: 1, marginRight: 12 }]}>
                  {categoryLabel(row.category)}
                </AppText>
                <Pressable
                  disabled={!!pending[row.category]}
                  onPress={() => toggle(row.category, row.inAppEnabled)}
                  hitSlop={8}
                >
                  <Icon
                    name={row.inAppEnabled ? "toggle" : "toggle-outline"}
                    size={32}
                    color={row.inAppEnabled ? t.colors.primary : t.colors.textFaint}
                  />
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      )}
      {__DEV__ ? <DevPushTestSection /> : null}
    </Screen>
  );
}

/**
 * Development-build'e özel test bildirimi — production build'de RENDER
 * EDİLMEZ (`__DEV__` kapısı). Sunucu da production'da 404 döner (çift kapı).
 */
function DevPushTestSection() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    if (state === "busy") return;
    setState("busy");
    setMessage(null);
    const res = await apiPost<{ sent: number }>("/api/v1/mobile/push-test", {});
    if (res.ok) {
      setState("sent");
      setMessage(lookup(getActiveLocale(), "notifSettings.devSent").replace("{n}", String(res.data.sent)));
    } else {
      setState("error");
      setMessage(res.error.message);
    }
  }

  return (
    <View>
      <SectionHeader title={tr("notifSettings.devSection")} />
      <Card>
        <AppText style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("notifSettings.devTitle")}</AppText>
        <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
          {tr("notifSettings.devHint")}
        </AppText>
        <Button
          label={tr("common.send")}
          icon="notifications-outline"
          variant="secondary"
          onPress={() => void send()}
          loading={state === "busy"}
          disabled={state === "busy"}
          style={{ marginTop: 12 }}
        />
        {message ? (
          <AppText style={[t.typography.caption, { color: state === "sent" ? t.colors.success : t.colors.danger, marginTop: 8 }]}>
            {message}
          </AppText>
        ) : null}
      </Card>
    </View>
  );
}
