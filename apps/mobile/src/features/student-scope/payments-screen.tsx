import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Text, View } from "react-native";
import { AppHeader, Button, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, SectionHeader, StatusBadge } from "../../components/ui";
import { startOnlineCheckout } from "../../payments/mobile-checkout";
import type { BadgeTone } from "../../components/ui/status-badge";
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { CacheStatus } from "../../cache/cache-status";
import { useCachedApiGet } from "../../cache/use-cached-api";
import { useSelectedStudentId } from "../../student/student-context";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { ledgerStatusBadge } from "../../lib/attendance-display";
import { formatCurrency, monthYearTitle, shortDayMonth } from "../../lib/date";
import { useLocale } from "../../i18n/locale-context";
import { downloadAndOpenFile } from "../../lib/open-file";

function longDate(date: Date): string {
  return `${shortDayMonth(date)} ${date.getFullYear()}`;
}
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";
import type { PaymentLedgerItem, PaymentLedgerMonth, PaymentLedgerResponse, PaymentReceiptResponse } from "../../types/api";

const STATUS_KEY: Record<string, { key: string; tone: BadgeTone }> = {
  paid: { key: "pay.statusPaid", tone: "success" },
  pending: { key: "pay.statusPending", tone: "warning" },
  overdue: { key: "pay.statusOverdue", tone: "danger" },
  partial: { key: "pay.statusPartial", tone: "info" },
  voided: { key: "pay.statusVoided", tone: "neutral" },
};

/** Ödeme statü rozeti — bilinmeyen statü kodu olduğu gibi gösterilir (uydurma yok). */
function usePaymentStatus() {
  const { t: tr } = useLocale();
  return (status: string): { label: string; tone: BadgeTone } => {
    const entry = STATUS_KEY[status];
    return entry ? { label: tr(entry.key), tone: entry.tone } : { label: status, tone: "neutral" };
  };
}

/**
 * Ödemeler — kayıt başından bugüne TÜM aylar (sunucu `months` özetleri +
 * ders zenginleştirmeli kalemler). Toplamlar İSTEMCİDE HESAPLANMAZ — ay
 * özetleri ve genel bakiye sunucudan gelir. Ay dökümü CSV olarak
 * indirilebilir/paylaşılabilir (kimlik doğrulamalı export ucu).
 */
export function StudentScopePaymentsScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const studentId = useSelectedStudentId();

  const res = useCachedApiGet<PaymentLedgerResponse>(studentId ? `/api/v1/students/${studentId}/payment-ledger?limit=200` : "");
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
      month ? `${tr("pay.filePrefix")}-${month}.csv` : tr("pay.fileAll")
    );
    setExporting(null);
    if (!r.ok) setExportError(r.message);
  }

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title={tr("pay.title")} showAccount={`${basePath}/hesabim`} />
      <CacheStatus cachedAt={res.cachedAt} isStale={res.isStale} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : (
        <>
          <Card style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={[t.typography.body, { color: t.colors.text }]}>{tr("pay.outstanding")}</Text>
                <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>
                  {tr("pay.officialHint")}
                </Text>
              </View>
              <Text style={[t.typography.cardTitle, { color: res.data.outstanding > 0 ? t.colors.danger : t.colors.success }]}>
                {formatCurrency(res.data.outstanding)}
              </Text>
            </View>
            <Button
              label={exporting === "all" ? tr("pay.preparing") : tr("pay.shareAll")}
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
            <EmptyState icon="card-outline" title={tr("pay.noRecords")} />
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
  const { t: tr } = useLocale();
  const payStatus = usePaymentStatus();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SectionHeader title={monthYearTitle(month.month)} />
        </View>
        <Button
          label={exporting ? "…" : tr("pay.share")}
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
          {tr("pay.accrued")}: {formatCurrency(month.accrued)} · {tr("pay.paid")}: {formatCurrency(month.paid)}
          {month.remaining > 0 ? ` · ${tr("pay.remaining")}: ${formatCurrency(month.remaining)}` : ""}
          {month.earliestUnpaidDueDate ? ` · ${tr("pay.due")}: ${longDate(new Date(month.earliestUnpaidDueDate))}` : ""}
        </Text>
        <StatusBadge label={payStatus(month.status).label} tone={payStatus(month.status).tone} />
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
                      ? tr("pay.paidLine", { p: formatCurrency(p.paidAmount), a: formatCurrency(p.amount) })
                      : formatCurrency(p.amount)}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]}>
                    {p.status === "paid" ? tr("pay.paidOn", { d: longDate(new Date(p.paidAt ?? p.dueDate)) }) : tr("pay.dueOn", { d: longDate(new Date(p.dueDate)) })}
                    {p.method ? ` · ${p.method}` : ""}
                  </Text>
                  {p.lesson ? (
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
                      {shortDayMonth(new Date(p.lesson.startAt))} · {p.lesson.teacherName ?? tr("home.teacherFallback")}
                      {p.lesson.branchName ? ` · ${p.lesson.branchName}` : ""}
                      {lessonBadge ? ` · ${lessonBadge.label}` : ""}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <StatusBadge label={payStatus(p.status).label} tone={payStatus(p.status).tone} />
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
  const { t: tr } = useLocale();
  const payStatus = usePaymentStatus();
  const base = usePersonaBasePath();
  const studentId = useSelectedStudentId();

  const ledger = useCachedApiGet<PaymentLedgerResponse>(studentId ? `/api/v1/students/${studentId}/payment-ledger?limit=200` : "");
  const receipt = useCachedApiGet<PaymentReceiptResponse>(`/api/v1/payments/${paymentId}/receipt`);
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
        <AppHeader title={tr("pay.payment")} showBack backFallback={listFallback(base, "odemeler")} showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (ledger.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("pay.payment")} showBack backFallback={listFallback(base, "odemeler")} showNotifications={false} />
        <ErrorState message={ledger.message} onRetry={ledger.refresh} />
      </Screen>
    );
  }
  if (!payment) {
    return (
      <Screen>
        <AppHeader title={tr("pay.payment")} showBack backFallback={listFallback(base, "odemeler")} showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title={tr("pay.missing")} />
      </Screen>
    );
  }

  const lessonBadge = payment.lesson ? ledgerStatusBadge(payment.lesson.displayKey) : null;

  return (
    <Screen>
      <AppHeader title={tr("pay.detail")} showBack backFallback={listFallback(base, "odemeler")} showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{payment.description}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
              {tr("pay.dueOn", { d: longDate(new Date(payment.dueDate)) })}
            </Text>
            {payment.paidAt ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                {tr("pay.paidDate", { d: longDate(new Date(payment.paidAt)) })}
              </Text>
            ) : null}
            {payment.method ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{tr("pay.method", { v: payment.method })}</Text>
            ) : null}
            {payment.contract ? (
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
                {tr("pay.contractLine", { p: payment.contract.programmeName, n: payment.contract.contractNumber })}
                {payment.contract.installmentSequence ? ` · ${tr("pay.installment", { n: payment.contract.installmentSequence })}` : ""}
              </Text>
            ) : null}
          </View>
          <StatusBadge label={payStatus(payment.status).label} tone={payStatus(payment.status).tone} />
        </View>
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.colors.divider }}>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("pay.amount")}</Text>
          <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 2 }]}>{formatCurrency(payment.amount)}</Text>
          {payment.status === "partial" ? (
            <Text style={[t.typography.caption, { color: t.colors.warning, marginTop: 4 }]}>
              {tr("pay.partialLine", { p: formatCurrency(payment.paidAmount), r: formatCurrency(payment.remaining) })}
            </Text>
          ) : null}
          {payment.paymentNote ? (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={3}>
              {tr("pay.note", { v: payment.paymentNote })}
            </Text>
          ) : null}
        </View>
      </Card>

      {payment.lesson ? (
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("pay.relatedLesson")}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
                {shortDayMonth(new Date(payment.lesson.startAt))} · {payment.lesson.teacherName ?? tr("home.teacherFallback")}
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
            label={tr("pay.payOnline")}
            icon="card-outline"
            onPress={() => void onOnlinePay()}
            loading={checkout.state === "busy"}
          />
          {checkout.state === "message" ? (
            <Text style={[t.typography.caption, { color: t.colors.warning, marginTop: 8 }]}>{checkout.message}</Text>
          ) : (
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 8 }]}>
              {tr("pay.providerNote")}
            </Text>
          )}
        </View>
      ) : null}

      {receipt.status === "success" && receipt.data.eligible && receipt.data.receipt ? (
        <>
          <Card style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon name="receipt-outline" size={18} color={t.colors.primary} />
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("pay.receipt")}</Text>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("pay.reference", { v: receipt.data.receipt.reference })}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{receipt.data.receipt.institutionName}</Text>
              {receipt.data.receipt.branchName ? (
                <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{receipt.data.receipt.branchName}</Text>
              ) : null}
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("pay.student", { v: receipt.data.receipt.studentName })}</Text>
              <Text style={[t.typography.body, { color: t.colors.text, marginTop: 4 }]}>
                {tr("pay.collected", { v: formatCurrency(receipt.data.receipt.amount) })}
              </Text>
            </View>
          </Card>
        </>
      ) : receipt.status === "success" && !receipt.data.eligible ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
            {receipt.data.ineligibleReason ?? tr("pay.receiptPending")}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
