import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { AppHeader, Button, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge } from "../../components/ui";
import { startOnlineCheckout } from "../../payments/mobile-checkout";
import type { BadgeTone } from "../../components/ui/status-badge";
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { useApiGet } from "../../hooks/use-api";
import { useSelectedStudentId } from "../../student/student-context";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { formatCurrency, shortDayMonth } from "../../lib/date";

function longDate(date: Date): string {
  return `${shortDayMonth(date)} ${date.getFullYear()}`;
}
import { useTheme } from "../../theme/theme-context";
import type { BalanceResponse, Payment, PaymentReceiptResponse } from "../../types/api";

const STATUS_LABEL: Record<string, string> = {
  paid: "Ödendi",
  pending: "Bekliyor",
  overdue: "Gecikti",
  partial: "Kısmi ödendi",
  voided: "İptal edildi",
};
const STATUS_TONE: Record<string, BadgeTone> = {
  paid: "success",
  pending: "warning",
  overdue: "danger",
  partial: "info",
  voided: "neutral",
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}
function statusTone(status: string): BadgeTone {
  return STATUS_TONE[status] ?? "neutral";
}

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function monthKey(dueDate: string): string {
  return dueDate.slice(0, 7);
}

function monthTitle(key: string): string {
  const [y, m] = key.split("-");
  const name = MONTHS_TR[(Number(m) - 1) % 12] ?? m;
  return `${name} ${y}`;
}

export function StudentScopePaymentsScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const router = useRouter();
  const studentId = useSelectedStudentId();

  const res = useApiGet<BalanceResponse>(studentId ? `/api/v1/students/${studentId}/balance` : "");
  useFocusRefetch(res.refresh);
  useAppForegroundRefetch(res.refresh);

  const groups = useMemo(() => {
    if (res.status !== "success") return [];
    const map = new Map<string, Payment[]>();
    for (const p of [...res.data.payments].sort((a, b) => b.dueDate.localeCompare(a.dueDate))) {
      const key = monthKey(p.dueDate);
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [res]);

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="Ödemeler" showAccount={`${basePath}/hesabim`} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : (
        <>
          <Card style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={[t.typography.body, { color: t.colors.text }]}>Bekleyen bakiye</Text>
                <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>
                  Kurum kayıtlarına göre güncel tutar
                </Text>
              </View>
              <Text style={[t.typography.cardTitle, { color: res.data.outstanding > 0 ? t.colors.danger : t.colors.success }]}>
                {formatCurrency(res.data.outstanding)}
              </Text>
            </View>
          </Card>

          {groups.length === 0 ? (
            <EmptyState icon="card-outline" title="Henüz ödeme kaydı yok" />
          ) : (
            <View style={{ gap: 16, marginTop: 12 }}>
              {groups.map(([key, list]) => {
                // Yalnız backend tutarlarının sunum toplamı — fiyat varsayımı yok.
                const total = list.reduce((n, p) => n + p.amount, 0);
                const paid = list.reduce((n, p) => n + p.paidAmount, 0);
                return (
                  <View key={key}>
                    <SectionHeader title={monthTitle(key)} />
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 8 }]}>
                      Tahakkuk: {formatCurrency(total)} · Ödenen: {formatCurrency(paid)}
                      {total - paid > 0 ? ` · Kalan: ${formatCurrency(total - paid)}` : ""}
                    </Text>
                    <View style={{ gap: 10 }}>
                      {list.map((p) => (
                        <Card key={p.id} onPress={() => router.push(`${basePath}/odemeler/${p.id}`)}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>
                                {p.description}
                              </Text>
                              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                                {p.status === "partial"
                                  ? `Ödenen: ${formatCurrency(p.paidAmount)} / ${formatCurrency(p.amount)}`
                                  : formatCurrency(p.amount)}
                              </Text>
                              <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>
                                {p.status === "paid" ? `Ödeme: ${longDate(new Date(p.paidAt ?? p.dueDate))}` : `Vade: ${longDate(new Date(p.dueDate))}`}
                                {p.method ? ` · ${p.method}` : ""}
                              </Text>
                            </View>
                            <View style={{ alignItems: "flex-end", gap: 6 }}>
                              <StatusBadge label={statusLabel(p.status)} tone={statusTone(p.status)} />
                              {p.receiptAvailable ? <Icon name="receipt-outline" size={16} color={t.colors.textMuted} /> : null}
                            </View>
                          </View>
                        </Card>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

export function StudentScopePaymentDetailScreen({ paymentId }: { paymentId: string }) {
  const t = useTheme();
  const studentId = useSelectedStudentId();

  const balance = useApiGet<BalanceResponse>(studentId ? `/api/v1/students/${studentId}/balance` : "");
  const receipt = useApiGet<PaymentReceiptResponse>(`/api/v1/payments/${paymentId}/receipt`);
  // Tarayıcıdan dönüşte (deep-link/payment-result) bakiye tazelenir.
  useFocusRefetch(balance.refresh);
  useAppForegroundRefetch(balance.refresh);

  const [checkout, setCheckout] = useState<{ state: "idle" } | { state: "busy" } | { state: "message"; message: string }>({
    state: "idle",
  });

  const payment: Payment | undefined =
    balance.status === "success" ? balance.data.payments.find((p) => p.id === paymentId) : undefined;

  const remaining = payment ? payment.amount - payment.paidAmount : 0;
  const canPayOnline =
    !!payment && (payment.status === "pending" || payment.status === "partial" || payment.status === "overdue") && remaining > 0;

  async function onOnlinePay() {
    if (!paymentId || checkout.state === "busy") return;
    setCheckout({ state: "busy" });
    const result = await startOnlineCheckout(paymentId, {
      canOpen: (url) => Linking.canOpenURL(url),
      open: (url) => Linking.openURL(url),
    });
    if (result.status === "ready") setCheckout({ state: "idle" });
    else setCheckout({ state: "message", message: result.message });
  }

  if (balance.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Ödeme" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (balance.status === "error") {
    return (
      <Screen>
        <AppHeader title="Ödeme" showBack showNotifications={false} />
        <ErrorState message={balance.message} onRetry={balance.refresh} />
      </Screen>
    );
  }
  if (!payment) {
    return (
      <Screen>
        <AppHeader title="Ödeme" showBack showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title="Ödeme bulunamadı" />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title="Ödeme detayı" showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{payment.description}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
              Vade: {longDate(new Date(payment.dueDate))}
            </Text>
            {payment.paidAt ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                Ödeme tarihi: {longDate(new Date(payment.paidAt))}
              </Text>
            ) : null}
            {payment.method ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>Yöntem: {payment.method}</Text>
            ) : null}
          </View>
          <StatusBadge label={statusLabel(payment.status)} tone={statusTone(payment.status)} />
        </View>
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.colors.divider }}>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Tutar</Text>
          <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 2 }]}>{formatCurrency(payment.amount)}</Text>
          {payment.status === "partial" ? (
            <Text style={[t.typography.caption, { color: t.colors.warning, marginTop: 4 }]}>
              Ödenen: {formatCurrency(payment.paidAmount)} · Kalan: {formatCurrency(payment.amount - payment.paidAmount)}
            </Text>
          ) : null}
        </View>
      </Card>

      {canPayOnline ? (
        <View style={{ marginTop: 12 }}>
          <Button
            label="Online öde"
            icon="card-outline"
            onPress={() => void onOnlinePay()}
            loading={checkout.state === "busy"}
          />
          {checkout.state === "message" ? (
            <Text style={[t.typography.caption, { color: t.colors.warning, marginTop: 8 }]}>{checkout.message}</Text>
          ) : (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 8 }]}>
              Ödeme, sağlayıcının güvenli sayfasında tamamlanır; kart bilginiz uygulamaya girmez.
            </Text>
          )}
        </View>
      ) : null}

      {receipt.status === "success" && receipt.data.eligible && receipt.data.receipt ? (
        <>
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon name="receipt-outline" size={18} color={t.colors.primary} />
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Makbuz</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Referans: {receipt.data.receipt.reference}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{receipt.data.receipt.institutionName}</Text>
              {receipt.data.receipt.branchName ? (
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{receipt.data.receipt.branchName}</Text>
              ) : null}
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Öğrenci: {receipt.data.receipt.studentName}</Text>
              <Text style={[t.typography.body, { color: t.colors.text, marginTop: 4 }]}>
                Tahsil edilen: {formatCurrency(receipt.data.receipt.amount)}
              </Text>
            </View>
          </Card>
        </>
      ) : receipt.status === "success" && !receipt.data.eligible ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
            {receipt.data.ineligibleReason ?? "Bu ödeme için makbuz henüz oluşturulamıyor."}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
