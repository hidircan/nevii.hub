import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { apiPatch, apiPost } from "../../api/client";
import { useAuth } from "../../auth/auth-context";
import { AppHeader, Button, Card, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader } from "../../components/ui";
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

  const rows = useMemo(() => (res.status === "success" ? res.data.preferences : []), [res]);

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

  return (
    <Screen>
      <AppHeader title={tr("notifications.settings")} showBack showNotifications={false} />
      {rows.length === 0 ? (
        <Card>
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>{tr("notifSettings.empty")}</Text>
        </Card>
      ) : (
        <Card>
          {saveError ? (
            <Text style={[t.typography.caption, { color: t.colors.danger, marginBottom: 8 }]}>{saveError}</Text>
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
                <Text style={[t.typography.body, { color: t.colors.text, flex: 1, marginRight: 12 }]}>
                  {categoryLabel(row.category)}
                </Text>
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
        <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("notifSettings.devTitle")}</Text>
        <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
          {tr("notifSettings.devHint")}
        </Text>
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
          <Text style={[t.typography.caption, { color: state === "sent" ? t.colors.success : t.colors.danger, marginTop: 8 }]}>
            {message}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}
