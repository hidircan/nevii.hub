import { useState } from "react";
import { Pressable, Text } from "react-native";
import { apiPatch } from "../../api/client";
import { AppHeader, Card, ErrorState, Icon, LoadingSkeleton, Screen } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useSelectedStudentId } from "../../student/student-context";
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";
import type { StudentProfile } from "../../types/api";

/** KVKK kapsamında — okuldan pazarlama/duyuru amaçlı iletişim alınıp alınmayacağını belirler (öğretmen/ders bildirimleri bundan etkilenmez). */
export function CommunicationPreferenceScreen() {
  const base = usePersonaBasePath();
  const t = useTheme();
  const studentId = useSelectedStudentId();
  const res = useApiGet<StudentProfile>(studentId ? `/api/v1/students/${studentId}` : "");
  const [busy, setBusy] = useState(false);
  const [optOut, setOptOut] = useState<boolean | null>(null);

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title="İletişim tercihleri" showBack backFallback={listFallback(base, "hesabim")} showNotifications={false} />
        <LoadingSkeleton rows={2} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title="İletişim tercihleri" showBack backFallback={listFallback(base, "hesabim")} showNotifications={false} />
        <ErrorState message={res.message} onRetry={res.refresh} />
      </Screen>
    );
  }

  const current = optOut ?? res.data.communicationOptOut;

  async function toggle() {
    const next = !current;
    setOptOut(next);
    setBusy(true);
    const patchRes = await apiPatch(`/api/v1/students/${studentId}/communication-preference`, { communicationOptOut: next });
    setBusy(false);
    if (!patchRes.ok) setOptOut(current);
  }

  return (
    <Screen>
      <AppHeader title="İletişim tercihleri" showBack backFallback={listFallback(base, "hesabim")} showNotifications={false} />

      <Card>
        <Text style={[t.typography.body, { color: t.colors.textMuted, marginBottom: 16 }]}>
          Bu tercih yalnızca genel duyuru/pazarlama iletişimini kapsar — dersinizle ilgili yoklama, ödev ve öğretmen
          bildirimleri her zaman gönderilir (KVKK kapsamında zorunlu hizmet iletişimi).
        </Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: current }}
          accessibilityLabel="Genel duyuru iletişimini alma"
          onPress={toggle}
          disabled={busy}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, opacity: busy ? 0.6 : 1 }}
        >
          <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Genel duyuru iletişimini alma</Text>
          <Icon name={current ? "toggle" : "toggle-outline"} size={32} color={current ? t.colors.primary : t.colors.textFaint} />
        </Pressable>
      </Card>
    </Screen>
  );
}
