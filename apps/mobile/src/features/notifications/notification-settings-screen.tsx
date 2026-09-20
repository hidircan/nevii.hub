import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { apiPatch, apiPost } from "../../api/client";
import { useAuth } from "../../auth/auth-context";
import { AppHeader, Button, Card, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useTheme } from "../../theme/theme-context";

type PreferenceRow = { category: string; inAppEnabled: boolean; pushEnabled: boolean };
type PreferencesResponse = { preferences: PreferenceRow[] };

/** Görüntüleme etiketleri — kategori kataloğu backend'de tek kaynak (`src/lib/notification-categories.ts`); sunucu zaten yalnızca implemented=true kategorileri döndürür. */
const LABELS: Record<string, string> = {
  lesson_started: "Ders başladı",
  lesson_upcoming: "Yaklaşan ders",
  lesson_cancelled: "Ders iptal edildi",
  lesson_rescheduled: "Ders ertelendi / telafiye alındı",
  lesson_reassigned: "Ders öğretmeni/şubesi değişti",
  homework_missing_for_lesson: "Ödev eksik",
  payment_overdue: "Vadesi geçmiş ödeme",
  payment_failed_or_pending: "Başarısız / bekleyen ödeme",
  payment_received: "Ödeme alındı",
  collections_approval_pending: "Onay bekleyen tahsilat mesajı",
  collections_send_failed: "Tahsilat gönderimi başarısız",
  task_new_assignment: "Kendisine atanan yeni iş",
  task_due_today: "Son tarihi bugün olan iş",
  task_overdue: "Gecikmiş iş",
  leave_new_request: "Yeni izin talebi",
  leave_pending_approval: "Bekleyen izin onayı",
  student_new_registration: "Yeni öğrenci kaydı",
  attendance_exception: "Devamsızlık istisnası",
  portal_request: "Portal talebi",
  teacher_feedback_submitted: "Öğretmen değerlendirmesi",
  student_feedback_submitted: "Öğrenci değerlendirmesi",
  teacher_feedback_shared: "Hakkımdaki değerlendirme paylaşıldı",
  announcement_published: "Yeni duyuru",
};

export function NotificationSettingsScreen() {
  const t = useTheme();
  useAuth();
  const res = useApiGet<PreferencesResponse>("/api/v1/notification-preferences");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const rows = useMemo(() => (res.status === "success" ? res.data.preferences : []), [res]);

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Bildirim ayarları" showBack showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title="Bildirim ayarları" showBack showNotifications={false} />
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
      setSaveError(patchRes.error.message || "Kaydedilemedi. Lütfen tekrar deneyin.");
      return;
    }
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="Bildirim ayarları" showBack showNotifications={false} />
      {rows.length === 0 ? (
        <Card>
          <Text style={[t.typography.body, { color: t.colors.textMuted }]}>Şu anda size özel bir bildirim ayarı bulunmuyor.</Text>
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
                  {LABELS[row.category] ?? row.category}
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
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send() {
    if (state === "busy") return;
    setState("busy");
    setMessage(null);
    const res = await apiPost<{ sent: number }>("/api/v1/mobile/push-test", {});
    if (res.ok) {
      setState("sent");
      setMessage(`Test bildirimi gönderildi (${res.data.sent} cihaz).`);
    } else {
      setState("error");
      setMessage(res.error.message);
    }
  }

  return (
    <View>
      <SectionHeader title="Geliştirici" />
      <Card>
        <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Test bildirimi gönder</Text>
        <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
          Yalnız bu cihaza (kendi oturumuna) tek bildirim gönderir.
        </Text>
        <Button
          label="Gönder"
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
