import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { AppHeader, Button, Card, EmptyState, ErrorState, LoadingSkeleton, Screen, SectionHeader, StatusBadge } from "../../components/ui";
import type { BadgeTone } from "../../components/ui/status-badge";
import { useAppForegroundRefetch } from "../../hooks/use-app-foreground-refetch";
import { useApiGet } from "../../hooks/use-api";
import { useFocusRefetch } from "../../hooks/use-focus-refetch";
import { downloadAndOpenFile } from "../../lib/open-file";
import { useSelectedStudentId } from "../../student/student-context";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";
import { formatCurrency, shortDayMonth } from "../../lib/date";
import type { StudentContractDetailResponse, StudentContractsResponse } from "../../types/api";

const TYPE_KEY: Record<string, string> = { initial: "contracts.typeInitial", renewal: "contracts.typeRenewal", amendment: "contracts.typeAmendment" };
const STATUS_KEY: Record<string, { key: string; tone: BadgeTone }> = {
  draft: { key: "contracts.stDraft", tone: "info" },
  generated: { key: "contracts.stGenerated", tone: "info" },
  printed: { key: "contracts.stPrinted", tone: "info" },
  wet_signature_pending: { key: "contracts.stWet", tone: "warning" },
  signed: { key: "contracts.stSigned", tone: "success" },
  recorded: { key: "contracts.stRecorded", tone: "success" },
  superseded: { key: "contracts.stSuperseded", tone: "neutral" },
  cancelled: { key: "contracts.stCancelled", tone: "neutral" },
};

/** Sözleşme tür/statü rozeti — bilinmeyen kod olduğu gibi gösterilir (uydurma yok). */
function useContractBadge() {
  const { t: tr } = useLocale();
  return {
    typeLabel: (code: string): string => {
      const key = TYPE_KEY[code];
      return key ? tr(key) : code;
    },
    status: (code: string): { label: string; tone: BadgeTone } => {
      const entry = STATUS_KEY[code];
      return entry ? { label: tr(entry.key), tone: entry.tone } : { label: code, tone: "info" };
    },
  };
}

/**
 * Sözleşmelerim — yalnız seçili öğrencinin, erişim hakkı olan sözleşmeleri.
 * Liste + detay gerçek uçlardan (`contracts:read` + `assertStudentAccess`);
 * uç yoksa sahte liste YOK. Belge paylaşımı yalnız `documentInstanceId`
 * varsa (gerçek imzalı nüsha) sunulur; yoksa açıklayıcı metin gösterilir.
 */
export function StudentScopeContractsScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const badge = useContractBadge();
  const router = useRouter();
  const studentId = useSelectedStudentId();
  const res = useApiGet<StudentContractsResponse>(studentId ? `/api/v1/students/${studentId}/contracts` : "");
  useFocusRefetch(res.autoRefresh);
  useAppForegroundRefetch(res.autoRefresh);

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title={tr("contracts.title")} showAccount={`${basePath}/hesabim`} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} code={res.code} />
      ) : res.data.contracts.length === 0 ? (
        <EmptyState icon="document-text-outline" title={tr("contracts.empty")} description={tr("contracts.emptyBody")} />
      ) : (
        <View style={{ gap: 10 }}>
          {res.data.contracts.map((c) => (
            <Card key={c.id} onPress={() => router.push(`${basePath}/sozlesmeler/${c.id}`)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={2}>
                    {badge.typeLabel(c.contractType)} · {c.programmeName}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                    {shortDayMonth(new Date(c.enrollmentStartDate))} – {shortDayMonth(new Date(c.enrollmentEndDate))} · {formatCurrency(c.totalContractAmount)}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
                    {tr("contracts.number", { n: c.contractNumber })}
                  </Text>
                </View>
                <StatusBadge label={badge.status(c.status).label} tone={badge.status(c.status).tone} />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

export function StudentScopeContractDetailScreen({ contractId }: { contractId: string }) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const badge = useContractBadge();
  const base = usePersonaBasePath();
  const studentId = useSelectedStudentId();
  // Liste üzerinden sahiplik ön-kontrolü: seçili öğrenciye ait olmayan ID
  // ile gelindiyse detay isteği sunucuda reddedilir (güvenli hata).
  const list = useApiGet<StudentContractsResponse>(studentId ? `/api/v1/students/${studentId}/contracts` : "");
  const detail = useApiGet<StudentContractDetailResponse>(`/api/v1/contracts/${contractId}`);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const owned = list.status === "success" && list.data.contracts.some((c) => c.id === contractId);

  async function shareDocument(documentInstanceId: string, contractNumber: string) {
    setSharing(true);
    setShareError(null);
    const r = await downloadAndOpenFile(`/api/v1/contracts/${contractId}/signed-file`, `${tr("contracts.filePrefix")}-${contractNumber}.pdf`);
    setSharing(false);
    if (!r.ok) setShareError(r.message);
  }

  if (list.status === "loading" || detail.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("contracts.single")} showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (list.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("contracts.single")} showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />
        <ErrorState message={list.message} onRetry={list.refresh} code={list.code} />
      </Screen>
    );
  }
  if (!owned) {
    return (
      <Screen>
        <AppHeader title={tr("contracts.single")} showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />
        <EmptyState icon="lock-closed-outline" title={tr("contracts.noAccess")} description={tr("contracts.noAccessBody")} />
      </Screen>
    );
  }
  if (detail.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("contracts.single")} showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />
        <ErrorState message={detail.message} onRetry={detail.refresh} code={detail.code} />
      </Screen>
    );
  }

  const { contract, installments } = detail.data;

  return (
    <Screen>
      <AppHeader title={tr("contracts.detail")} showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>
              {badge.typeLabel(contract.contractType)} · {contract.programmeName}
            </Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
              {tr("contracts.numberVer", { n: contract.contractNumber, v: contract.versionNumber })}
            </Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {tr("contracts.period", { a: shortDayMonth(new Date(contract.enrollmentStartDate)), b: shortDayMonth(new Date(contract.enrollmentEndDate)), m: contract.durationMonths })}
            </Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {tr("contracts.signatory", { v: contract.signatoryFullName })}
            </Text>
          </View>
          <StatusBadge label={badge.status(contract.status).label} tone={badge.status(contract.status).tone} />
        </View>
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.colors.divider }}>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("contracts.total")}</Text>
          <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 2 }]}>{formatCurrency(contract.totalContractAmount)}</Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
            {tr("contracts.monthly", { a: formatCurrency(contract.monthlyAmount), n: contract.installmentCount })}
            {contract.depositAmount ? ` · ${tr("contracts.deposit", { v: formatCurrency(contract.depositAmount) })}` : ""}
          </Text>
        </View>
      </Card>

      <SectionHeader title={tr("contracts.installments")} />
      {installments.length === 0 ? (
        <EmptyState icon="calendar-outline" title={tr("contracts.noInstallments")} />
      ) : (
        <View style={{ gap: 8 }}>
          {installments.map((ins) => (
            <Card key={ins.paymentId}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>
                    {tr("contracts.installmentN", { n: ins.sequence })}{ins.periodLabel ? ` · ${ins.periodLabel}` : ""}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                    {tr("contracts.dueLine", { d: shortDayMonth(new Date(ins.dueDate)), a: formatCurrency(ins.amount) })}
                    {ins.paidAmount > 0 ? ` · ${tr("contracts.paidLine", { v: formatCurrency(ins.paidAmount) })}` : ""}
                  </Text>
                </View>
                <StatusBadge label={badge.status(ins.status).label} tone={badge.status(ins.status).tone} />
              </View>
            </Card>
          ))}
        </View>
      )}

      <SectionHeader title={tr("contracts.document")} />
      {contract.documentInstanceId ? (
        <>
          <Button
            label={sharing ? tr("contracts.preparing") : tr("contracts.downloadShare")}
            onPress={() => void shareDocument(contract.documentInstanceId!, contract.contractNumber)}
            disabled={sharing}
            loading={sharing}
          />
          {shareError ? (
            <Card style={{ marginTop: 8 }}>
              <Text style={[t.typography.caption, { color: t.colors.danger }]}>{shareError}</Text>
            </Card>
          ) : null}
        </>
      ) : (
        <Card>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
            {tr("contracts.noDocument")}
          </Text>
        </Card>
      )}
    </Screen>
  );
}
