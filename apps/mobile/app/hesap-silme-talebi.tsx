import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { apiPost } from "../src/api/client";
import { AppHeader, Button, Card, ConfirmDialog, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge, TextField, AppText } from "../src/components/ui";
import { useApiGet } from "../src/hooks/use-api";
import { getLegalLinks } from "../src/legal/legal-links";
import { useLocale } from "../src/i18n/locale-context";
import { useTheme } from "../src/theme/theme-context";
import type { MyDeletionResponse } from "../src/types/api";

const STATUS_KEY: Record<string, string> = {
  pending: "deletion.stPending",
  approved: "deletion.stApproved",
  rejected: "deletion.stRejected",
  processed: "deletion.stProcessed",
  cancelled: "deletion.stCancelled",
};

/**
 * Hesap silme talebi — tüm personalar için ortak (Hesabım → Gizlilik ve
 * veri). Güçlü onay + sunucu talebi + durum takibi + geri çekme. Herkese
 * açık bilgilendirme sayfası uygulama dışında açılır.
 */
export default function HesapSilmeTalebi() {
  const t = useTheme();
  const { t: tr } = useLocale();
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
      setError(result.error.message || tr("deletion.submitFailed"));
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
      setError(result.error.message || tr("deletion.withdrawFailed"));
      return;
    }
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title={tr("deletion.title")} showBack showNotifications={false} />

      {error ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <AppText style={[t.typography.body, { color: t.colors.danger }]}>{error}</AppText>
        </Card>
      ) : null}

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.open ? (
        <>
          <SectionHeader title={tr("deletion.activeRequest")} />
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <AppText style={[t.typography.body, { color: t.colors.text, flex: 1 }]} numberOfLines={2}>
                {res.data.open.reason || tr("deletion.defaultReason")}
              </AppText>
              <StatusBadge
                label={STATUS_KEY[res.data.open.status] ? tr(STATUS_KEY[res.data.open.status]!) : res.data.open.status}
                tone={res.data.open.status === "approved" ? "success" : "warning"}
              />
            </View>
            <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>
              {tr("deletion.underReview")}
            </AppText>
            {res.data.open.status === "pending" ? (
              <Button label={tr("deletion.withdraw")} variant="secondary" style={{ marginTop: 12 }} loading={busy} onPress={withdraw} />
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <SectionHeader title={tr("deletion.meaning")} />
          <Card>
            <AppText style={[t.typography.body, { color: t.colors.text }]}>
              {tr("deletion.meaningBody")}
            </AppText>
            <AppText
              style={[t.typography.body, { color: t.colors.primary, marginTop: 10 }]}
              onPress={() => void Linking.openURL(links.accountDeletionUrl)}
              accessibilityRole="link"
            >
              {tr("deletion.moreInfo")}
            </AppText>
          </Card>

          <SectionHeader title={tr("deletion.newRequest")} />
          <Card>
            <TextField label={tr("deletion.reasonLabel")} value={reason} onChangeText={setReason} placeholder={tr("deletion.reasonPlaceholder")} multiline numberOfLines={3} />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmed }}
              onPress={() => setConfirmed((c) => !c)}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 14 }}
              hitSlop={8}
            >
              <Icon name={confirmed ? "checkbox" : "square-outline"} size={22} color={confirmed ? t.colors.primary : t.colors.textMuted} />
              <AppText style={[t.typography.body, { color: t.colors.text, flex: 1 }]}>
                {tr("deletion.confirmText")}
              </AppText>
            </Pressable>
            <Button
              label={tr("deletion.submit")}
              variant="danger"
              style={{ marginTop: 14 }}
              disabled={!confirmed}
              loading={busy}
              onPress={() => setConfirming(true)}
            />
          </Card>

          {res.data.history.length > 0 ? (
            <>
              <SectionHeader title={tr("deletion.history")} />
              <View style={{ gap: 8 }}>
                {res.data.history.map((h) => (
                  <Card key={h.id}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <AppText style={[t.typography.caption, { color: t.colors.textMuted, flex: 1 }]} numberOfLines={1}>
                        {h.reason || tr("deletion.defaultReason")}
                      </AppText>
                      <StatusBadge label={STATUS_KEY[h.status] ? tr(STATUS_KEY[h.status]!) : h.status} tone="neutral" />
                    </View>
                  </Card>
                ))}
              </View>
            </>
          ) : (
            <EmptyState icon="shield-checkmark-outline" title={tr("deletion.noHistory")} />
          )}
        </>
      )}

      <ConfirmDialog
        visible={confirming}
        title={tr("deletion.dialogTitle")}
        message={tr("deletion.dialogBody")}
        confirmLabel={tr("deletion.dialogConfirm")}
        danger
        onConfirm={submit}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
