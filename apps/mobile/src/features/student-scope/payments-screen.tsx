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
import { ledgerStatusBadge } from "../../lib/attendance-display";
import { formatCurrency, shortDayMonth } from "../../lib/date";
import { downloadAndOpenFile } from "../../lib/open-file";

function longDate(date: Date): string {
  return `${shortDayMonth(date)} ${date.getFullYear()}`;
}
import { useTheme } from "../../theme/theme-context";
import type { PaymentLedgerItem, PaymentLedgerMonth, PaymentLedgerResponse, PaymentReceiptResponse } from "../../types/api";

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

function monthTitle(key: string): string {
  const [y, m] = key.split("-");
  const name = MONTHS_TR[(Number(m) - 1) % 12] ?? m;
  return `${name} ${y}`;
}

/**
 * Ödemeler — kayıt başından bugüne TÜM aylar (sunucu `months` özetleri +
 * ders zenginleştirmeli kalemler). Toplamlar İSTEMCİDE HESAPLANMAZ — ay
 * özetleri ve genel bakiye sunucudan gelir. Ay dökümü CSV olarak
 * indirilebilir/paylaşılabilir (kimlik doğrulamalı export ucu).
 */
export function StudentScopePaymentsScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const router = useRouter();
  const studentId = useSelectedStudentId();

  const res = useApiGet<PaymentLedgerResponse>(studentId ? `/api/v1/students/${studentId}/payment-ledger?limit=200` : "");
  useFocusRefetch(res.refresh);
  useAppForegroundRefetch(res.refresh);

  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (res.status !== "success") return [];
    const byMonth = new Map<string, PaymentLedgerItem[]>();
    for (const item of res.data.items) {
      const key = item.dueDate.slice(0, 7);
      const list = byMonth.get(key) ?? [];
      list.push(item);
      byMonth.set(key, list);
    }
    return res.data.months.map((m) => ({ month: m, items: byMonth.get(m.month) ?? [] }));
  }, [res]);

  async function exportMonth(month: string | null) {
    if (!studentId || exporting) return;
    setExporting(month ?? "all");
    setExportError(null);
    const query = month ? `?month=${month}` : "";
    const r = await downloadAndOpenFile(
      `/api/v1/students/${studentId}/payment-ledger/export${query}`,
      month ? `odeme-dokumu-${month}.csv` : "odeme-dokumu-tumu.csv"
    );
    setExporting(null);
    if (!r.ok) setExportError(r.message);
  }

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
            <Button
              label={exporting === "all" ? "Hazırlanıyor…" : "Tüm dökümü paylaş"}
              icon="share-outline"
              variant="secondary"
              size="sm"
              onPress={() => void exportMonth(null)}
              loading={exporting === "all"}
              disabled={exporting !== null}
              style={{ marginTop: 12 }}
            />
            {exportError && exporting === null ? (
              <Text style={[t.typography.caption, { color: t.colors.danger, marginTop: 8 }]}>{exportError}</Text>
            ) : null}
          </Card>

          {groups.length === 0 ? (
            <EmptyState icon="card-outline" title="Henüz ödeme kaydı yok" />
          ) : (
            <View style={{ gap: 16, marginTop: 12 }}>
              {groups.map(({ month, items }) => (
                <MonthGroup
                  key={month.month}
                  month={month}
                  items={items}
                  exporting={exporting === month.month}
                  exportDisabled={exporting !== null}
                  onExport={() => void exportMonth(month.month)}
                  onOpen={(id) => router.push(`${basePath}/odemeler/${id}`)}
                />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function MonthGroup({
  month,
  items,
  exporting,
  exportDisabled,
  onExport,
  onOpen,
}: {
  month: PaymentLedgerMonth;
  items: PaymentLedgerItem[];
  exporting: boolean;
  exportDisabled: boolean;
  onExport: () => void;
  onOpen: (paymentId: string) => void;
}) {
  const t = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SectionHeader title={monthTitle(month.month)} />
        </View>
        <Button
          label={exporting ? "…" : "Paylaş"}
          icon="share-outline"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={onExport}
          loading={exporting}
          disabled={exportDisabled}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Text style={[t.typography.caption, { color: t.colors.textMuted, flex: 1 }]} numberOfLines={2}>
          Tahakkuk: {formatCurrency(month.accrued)} · Ödenen: {formatCurrency(month.paid)}
          {month.remaining > 0 ? ` · Kalan: ${formatCurrency(month.remaining)}` : ""}
          {month.earliestUnpaidDueDate ? ` · Vade: ${longDate(new Date(month.earliestUnpaidDueDate))}` : ""}
        </Text>
        <StatusBadge label={statusLabel(month.status)} tone={statusTone(month.status)} />
      </View>
      <View style={{ gap: 10 }}>
        {items.map((p) => {
          const lessonBadge = p.lesson ? ledgerStatusBadge(p.lesson.displayKey) : null;
          return (
            <Card key={p.id} onPress={() => onOpen(p.id)}>
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
                  {p.lesson ? (
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                      {shortDayMonth(new Date(p.lesson.startAt))} · {p.lesson.teacherName ?? "Öğretmen"}
                      {p.lesson.branchName ? ` · ${p.lesson.branchName}` : ""}
                      {lessonBadge ? ` · ${lessonBadge.label}` : ""}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <StatusBadge label={statusLabel(p.status)} tone={statusTone(p.status)} />
                  {p.receiptAvailable ? <Icon name="receipt-outline" size={16} color={t.colors.textMuted} /> : null}
                </View>
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

export function StudentScopePaymentDetailScreen({ paymentId }: { paymentId: string }) {
  const t = useTheme();
  const studentId = useSelectedStudentId();

  const ledger = useApiGet<PaymentLedgerResponse>(studentId ? `/api/v1/students/${studentId}/payment-ledger?limit=200` : "");
  const receipt = useApiGet<PaymentReceiptResponse>(`/api/v1/payments/${paymentId}/receipt`);
  // Tarayıcıdan dönüşte (deep-link/payment-result) bakiye tazelenir.
  useFocusRefetch(ledger.refresh);
  useAppForegroundRefetch(ledger.refresh);

  const [checkout, setCheckout] = useState<{ state: "idle" } | { state: "busy" } | { state: "message"; message: string }>({
    state: "idle",
  });

  const payment: PaymentLedgerItem | undefined =
    ledger.status === "success" ? ledger.data.items.find((p) => p.id === paymentId) : undefined;

  const remaining = payment ? payment.remaining : 0;
  // "Şimdi öde" YALNIZ sağlayıcı gerçekten yapılandırıldıysa (sunucu bayrağı) + tahsil edilebilir durumdaysa.
  const canPayOnline =
    ledger.status === "success" &&
    ledger.data.onlinePayEnabled &&
    !!payment &&
    (payment.status === "pending" || payment.status === "partial" || payment.status === "overdue") &&
    remaining > 0;

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

  if (ledger.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Ödeme" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (ledger.status === "error") {
    return (
      <Screen>
        <AppHeader title="Ödeme" showBack showNotifications={false} />
        <ErrorState message={ledger.message} onRetry={ledger.refresh} />
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

  const lessonBadge = payment.lesson ? ledgerStatusBadge(payment.lesson.displayKey) : null;

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
            {payment.contract ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
                {payment.contract.programmeName} · Sözleşme No: {payment.contract.contractNumber}
                {payment.contract.installmentSequence ? ` · ${payment.contract.installmentSequence}. taksit` : ""}
              </Text>
            ) : null}
          </View>
          <StatusBadge label={statusLabel(payment.status)} tone={statusTone(payment.status)} />
        </View>
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.colors.divider }}>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Tutar</Text>
          <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 2 }]}>{formatCurrency(payment.amount)}</Text>
          {payment.status === "partial" ? (
            <Text style={[t.typography.caption, { color: t.colors.warning, marginTop: 4 }]}>
              Ödenen: {formatCurrency(payment.paidAmount)} · Kalan: {formatCurrency(payment.remaining)}
            </Text>
          ) : null}
          {payment.paymentNote ? (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={3}>
              Açıklama: {payment.paymentNote}
            </Text>
          ) : null}
        </View>
      </Card>

      {payment.lesson ? (
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>İlgili ders</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
                {shortDayMonth(new Date(payment.lesson.startAt))} · {payment.lesson.teacherName ?? "Öğretmen"}
                {payment.lesson.branchName ? ` · ${payment.lesson.branchName}` : ""}
                {payment.lesson.roomName ? ` · ${payment.lesson.roomName}` : ""}
                {payment.lesson.instrument ? ` · ${payment.lesson.instrument}` : ""}
              </Text>
            </View>
            {lessonBadge ? <StatusBadge label={lessonBadge.label} tone={lessonBadge.tone} /> : null}
          </View>
        </Card>
      ) : null}

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
