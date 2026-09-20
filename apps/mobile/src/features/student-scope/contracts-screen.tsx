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
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";
import { formatCurrency, shortDayMonth } from "../../lib/date";
import type { StudentContractDetailResponse, StudentContractsResponse } from "../../types/api";

const TYPE_LABEL: Record<string, string> = { initial: "İlk kayıt", renewal: "Yenileme", amendment: "Değişiklik" };
const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  generated: "Oluşturuldu",
  printed: "Yazdırıldı",
  wet_signature_pending: "Islak imza bekleniyor",
  signed: "İmzalandı",
  recorded: "Kaydedildi",
  superseded: "Yenilendi",
  cancelled: "İptal edildi",
};
const STATUS_TONE: Record<string, BadgeTone> = {
  signed: "success",
  recorded: "success",
  cancelled: "neutral",
  superseded: "neutral",
  wet_signature_pending: "warning",
};

function statusLabel(s: string): string {
  return STATUS_LABEL[s] ?? s;
}
function statusTone(s: string): BadgeTone {
  return STATUS_TONE[s] ?? "info";
}

/**
 * Sözleşmelerim — yalnız seçili öğrencinin, erişim hakkı olan sözleşmeleri.
 * Liste + detay gerçek uçlardan (`contracts:read` + `assertStudentAccess`);
 * uç yoksa sahte liste YOK. Belge paylaşımı yalnız `documentInstanceId`
 * varsa (gerçek imzalı nüsha) sunulur; yoksa açıklayıcı metin gösterilir.
 */
export function StudentScopeContractsScreen({ basePath }: { basePath: "/(parent)" | "/(student)" }) {
  const t = useTheme();
  const router = useRouter();
  const studentId = useSelectedStudentId();
  const res = useApiGet<StudentContractsResponse>(studentId ? `/api/v1/students/${studentId}/contracts` : "");
  useFocusRefetch(res.refresh);
  useAppForegroundRefetch(res.refresh);

  return (
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="Sözleşmelerim" showAccount={`${basePath}/hesabim`} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={3} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} code={res.code} />
      ) : res.data.contracts.length === 0 ? (
        <EmptyState icon="document-text-outline" title="Sözleşme bulunamadı" description="Bu öğrenci için kayıtlı sözleşme yok." />
      ) : (
        <View style={{ gap: 10 }}>
          {res.data.contracts.map((c) => (
            <Card key={c.id} onPress={() => router.push(`${basePath}/sozlesmeler/${c.id}`)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={2}>
                    {TYPE_LABEL[c.contractType] ?? c.contractType} · {c.programmeName}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                    {shortDayMonth(new Date(c.enrollmentStartDate))} – {shortDayMonth(new Date(c.enrollmentEndDate))} · {formatCurrency(c.totalContractAmount)}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]} numberOfLines={1}>
                    Sözleşme No: {c.contractNumber}
                  </Text>
                </View>
                <StatusBadge label={statusLabel(c.status)} tone={statusTone(c.status)} />
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
    const r = await downloadAndOpenFile(`/api/v1/contracts/${contractId}/signed-file`, `sozlesme-${contractNumber}.pdf`);
    setSharing(false);
    if (!r.ok) setShareError(r.message);
  }

  if (list.status === "loading" || detail.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Sözleşme" showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (list.status === "error") {
    return (
      <Screen>
        <AppHeader title="Sözleşme" showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />
        <ErrorState message={list.message} onRetry={list.refresh} code={list.code} />
      </Screen>
    );
  }
  if (!owned) {
    return (
      <Screen>
        <AppHeader title="Sözleşme" showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />
        <EmptyState icon="lock-closed-outline" title="Bu sözleşmeye erişiminiz yok" description="Seçili öğrenci değişmiş olabilir." />
      </Screen>
    );
  }
  if (detail.status === "error") {
    return (
      <Screen>
        <AppHeader title="Sözleşme" showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />
        <ErrorState message={detail.message} onRetry={detail.refresh} code={detail.code} />
      </Screen>
    );
  }

  const { contract, installments } = detail.data;

  return (
    <Screen>
      <AppHeader title="Sözleşme detayı" showBack backFallback={listFallback(base, "sozlesmeler")} showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>
              {TYPE_LABEL[contract.contractType] ?? contract.contractType} · {contract.programmeName}
            </Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
              Sözleşme No: {contract.contractNumber} · v{contract.versionNumber}
            </Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              Dönem: {shortDayMonth(new Date(contract.enrollmentStartDate))} – {shortDayMonth(new Date(contract.enrollmentEndDate))} ({contract.durationMonths} ay)
            </Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              İmzalayan: {contract.signatoryFullName}
            </Text>
          </View>
          <StatusBadge label={statusLabel(contract.status)} tone={statusTone(contract.status)} />
        </View>
        <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.colors.divider }}>
          <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Toplam tutar</Text>
          <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 2 }]}>{formatCurrency(contract.totalContractAmount)}</Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
            Aylık: {formatCurrency(contract.monthlyAmount)} · {contract.installmentCount} taksit
            {contract.depositAmount ? ` · Depozito: ${formatCurrency(contract.depositAmount)}` : ""}
          </Text>
        </View>
      </Card>

      <SectionHeader title="Taksit planı" />
      {installments.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Taksit planı yok" />
      ) : (
        <View style={{ gap: 8 }}>
          {installments.map((ins) => (
            <Card key={ins.paymentId}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>
                    {ins.sequence}. taksit{ins.periodLabel ? ` · ${ins.periodLabel}` : ""}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                    Vade: {shortDayMonth(new Date(ins.dueDate))} · {formatCurrency(ins.amount)}
                    {ins.paidAmount > 0 ? ` · Ödenen: ${formatCurrency(ins.paidAmount)}` : ""}
                  </Text>
                </View>
                <StatusBadge label={statusLabel(ins.status)} tone={statusTone(ins.status)} />
              </View>
            </Card>
          ))}
        </View>
      )}

      <SectionHeader title="Belge" />
      {contract.documentInstanceId ? (
        <>
          <Button
            label={sharing ? "Hazırlanıyor…" : "İmzalı belgeyi indir / paylaş"}
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
            Bu kayıt için resmi sözleşme belgesi üretilmedi (tanışma paketi kaydı olabilir). Detay için kurumunuzla iletişime geçin.
          </Text>
        </Card>
      )}
    </Screen>
  );
}
