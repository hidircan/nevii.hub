import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { apiPost } from "../src/api/client";
import {
  AppHeader,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  LoadingSkeleton,
  Screen,
  SectionHeader,
  StatusBadge,
  TextField,
} from "../src/components/ui";
import { useApiGet } from "../src/hooks/use-api";
import { getLegalLinks } from "../src/legal/legal-links";
import { useTheme } from "../src/theme/theme-context";
import type { MyDeletionResponse } from "../src/types/api";

const STATUS_LABEL: Record<string, string> = {
  pending: "İnceleniyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  processed: "İşlendi",
  cancelled: "Geri çekildi",
};

/**
 * Hesap silme talebi — tüm personalar için ortak (Hesabım → Gizlilik ve
 * veri). Güçlü onay + sunucu talebi + durum takibi + geri çekme. Herkese
 * açık bilgilendirme sayfası uygulama dışında açılır.
 */
export default function HesapSilmeTalebi() {
  const t = useTheme();
  const links = getLegalLinks();
  const res = useApiGet<MyDeletionResponse>("/api/v1/account/deletion-request");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    const result = await apiPost("/api/v1/account/deletion-request", {
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      confirm: true,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message || "Talep gönderilemedi.");
      return;
    }
    setReason("");
    setConfirmed(false);
    res.refresh();
  }

  async function withdraw() {
    setBusy(true);
    setError(null);
    const result = await apiPost("/api/v1/account/deletion-request/cancel", {});
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message || "Talep geri çekilemedi.");
      return;
    }
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="Hesap silme talebi" showBack showNotifications={false} />

      {error ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <Text style={[t.typography.body, { color: t.colors.danger }]}>{error}</Text>
        </Card>
      ) : null}

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.open ? (
        <>
          <SectionHeader title="Aktif talebiniz" />
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[t.typography.body, { color: t.colors.text, flex: 1 }]} numberOfLines={2}>
                {res.data.open.reason || "Silme talebi"}
              </Text>
              <StatusBadge
                label={STATUS_LABEL[res.data.open.status] ?? res.data.open.status}
                tone={res.data.open.status === "approved" ? "success" : "warning"}
              />
            </View>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>
              Talebiniz kurum yöneticiniz tarafından inceleniyor. Sonuçlandığında bu ekrandan görebilirsiniz.
            </Text>
            {res.data.open.status === "pending" ? (
              <Button label="Talebi geri çek" variant="secondary" style={{ marginTop: 12 }} loading={busy} onPress={withdraw} />
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <SectionHeader title="Talebiniz ne anlama gelir?" />
          <Card>
            <Text style={[t.typography.body, { color: t.colors.text }]}>
              Talebiniz kurum yöneticinize iletilir. Onaylanırsa profil, iletişim ve eğitim içerik verileriniz silinir
              veya anonimleştirilir. Yasal saklama zorunluluğu olan sınırlı kayıtlar (mali belgeler, güvenlik denetim
              izleri) mevzuatın gerektirdiği süre boyunca korunur.
            </Text>
            <Text
              style={[t.typography.body, { color: t.colors.primary, marginTop: 10 }]}
              onPress={() => void Linking.openURL(links.accountDeletionUrl)}
              accessibilityRole="link"
            >
              Detaylı bilgi (uygulama dışında açılır) →
            </Text>
          </Card>

          <SectionHeader title="Yeni talep" />
          <Card>
            <TextField label="Gerekçe (isteğe bağlı)" value={reason} onChangeText={setReason} placeholder="Kısaca nedeninizi yazabilirsiniz" multiline numberOfLines={3} />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              onPress={() => setConfirmed((c) => !c)}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 14 }}
              hitSlop={8}
            >
              <Icon name={confirmed ? "checkbox" : "square-outline"} size={22} color={confirmed ? t.colors.primary : t.colors.textMuted} />
              <Text style={[t.typography.body, { color: t.colors.text, flex: 1 }]}>
                Hesabımın silinmesini istediğimi onaylıyorum. Bu işlemin geri alınamayacağını biliyorum.
              </Text>
            </Pressable>
            <Button
              label="Silme talebi gönder"
              variant="danger"
              style={{ marginTop: 14 }}
              disabled={!confirmed}
              loading={busy}
              onPress={() => setConfirming(true)}
            />
          </Card>

          {res.data.history.length > 0 ? (
            <>
              <SectionHeader title="Geçmiş talepler" />
              <View style={{ gap: 8 }}>
                {res.data.history.map((h) => (
                  <Card key={h.id}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[t.typography.caption, { color: t.colors.textMuted, flex: 1 }]} numberOfLines={1}>
                        {h.reason || "Silme talebi"}
                      </Text>
                      <StatusBadge label={STATUS_LABEL[h.status] ?? h.status} tone="neutral" />
                    </View>
                  </Card>
                ))}
              </View>
            </>
          ) : (
            <EmptyState icon="shield-checkmark-outline" title="Önceki talebiniz yok" />
          )}
        </>
      )}

      <ConfirmDialog
        visible={confirming}
        title="Silme talebi gönderilsin mi?"
        message="Talebiniz kurum yöneticinize iletilecek. Onaylanırsa hesabınız silinir ve bu işlem geri alınamaz."
        confirmLabel="Talebi gönder"
        danger
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
