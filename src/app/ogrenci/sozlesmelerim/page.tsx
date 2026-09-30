import Link from "next/link";
import { redirect } from "next/navigation";
import { PORTAL_RECORD_MISSING_REDIRECT } from "@/lib/auth/portal-record-missing";
import { ArrowLeft } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getPortalPageStudentId } from "@/lib/portal-context";
import { readReferenceData } from "@/lib/store";
import { listStudentContractsTool, getStudentContractTool } from "@/lib/services";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatMoney, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  draft: "Taslak",
  generated: "Oluşturuldu",
  printed: "Yazdırıldı",
  wet_signature_pending: "Islak imza bekleniyor",
  signed: "İmzalandı",
  recorded: "Kayıt tamamlandı (sözleşme gerekmiyor)",
  superseded: "Yenilendi (eski sürüm)",
  cancelled: "İptal edildi",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  initial: "İlk Kayıt",
  renewal: "Yenileme",
  amendment: "Değişiklik",
};

/**
 * FEATURE A.3 — Karma Öğrenci Portalı "Sözleşmelerim". `/ogrenci/odevlerim`
 * ile AYNI desen: yalnızca `session.studentId`'ye ait sözleşmeler (tool
 * katmanında `canAccessStudent` ile kapsamlanır — öğretmen bu sayfaya asla
 * erişemez, `contracts:read` izni öğretmene VERİLMEMİŞTİR).
 */
export default async function StudentContractsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci/sozlesmelerim");
  }
  if (session.role === "TEACHER") redirect("/ogretmen");

  // 10. tur iş #1 — çözümlenmiş aktif öğrenci bağlamı (cookie/JWT tercihi
  // sunucuda doğrulanır); `|| "s1"` yedeği KALDIRILDI (başka öğrencinin verisi asla açılmaz).
  const studentId = await getPortalPageStudentId(session);
  if (!studentId) redirect(PORTAL_RECORD_MISSING_REDIRECT);
  const data = await readReferenceData();
  const student = data.students.find((s) => s.id === studentId);
  if (!student || (session.role === "STUDENT" && (!student.active || student.deletedAt))) {
    redirect(PORTAL_RECORD_MISSING_REDIRECT);
  }

  const listResult = await listStudentContractsTool(session, { studentId: student.id });
  const contracts = listResult.ok ? listResult.data.contracts : [];
  const latest = contracts.find((c) => c.status !== "superseded" && c.status !== "cancelled") ?? contracts[0];

  const latestDetail = latest ? await getStudentContractTool(session, { contractId: latest.id }) : undefined;
  const latestInstallments = latestDetail?.ok ? latestDetail.data.installments : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-50">
      <header className="border-b border-emerald-100 bg-[var(--color-surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-4">
          <Link href="/ogrenci" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-muted)]">
            <ArrowLeft className="h-4 w-4" /> Geri
          </Link>
          <p className="text-sm font-semibold text-[var(--color-text)] dark:text-slate-50">Sözleşmelerim</p>
          <span className="w-10" />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-3 px-4 py-6 pb-24">
        {contracts.length === 0 ? (
          <EmptyState title="Henüz sözleşme yok" description="Kurum sizin için kayıt sözleşmesi oluşturduğunda burada görünecek." />
        ) : (
          contracts.map((c) => {
            const isLatest = c.id === latest?.id;
            return (
              <Card key={c.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--color-text)] dark:text-slate-50">
                      {c.contractNumber} · v{c.versionNumber} · {CONTRACT_TYPE_LABELS[c.contractType] ?? c.contractType}
                      {isLatest ? (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          GÜNCEL
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{c.programmeName}</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      {formatDate(c.enrollmentStartDate)} – {formatDate(c.enrollmentEndDate)} · {c.durationMonths} ay
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Aylık {formatMoney(c.monthlyAmount)} · Toplam {formatMoney(c.totalContractAmount)} ({c.installmentCount} taksit)
                    </p>
                  </div>
                  <Badge status={c.status}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
                </div>

                {isLatest && latestInstallments.length > 0 ? (
                  <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <p className="mb-1 font-medium text-[var(--color-text)] dark:text-slate-200">Ödeme takvimi</p>
                    {latestInstallments.map((row) => (
                      <div key={row.paymentId} className="flex items-center justify-between py-0.5">
                        <span>
                          {row.sequence}. taksit — {formatDate(row.dueDate)}
                        </span>
                        <span className="flex items-center gap-2">
                          {formatMoney(row.amount)}
                          <Badge status={row.status} />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {c.documentInstanceId ? (
                  <Link
                    href={`/sozlesme-yazdir/${c.id}`}
                    target="_blank"
                    className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Sözleşmeyi görüntüle / yazdır →
                  </Link>
                ) : (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">Tanışma paketi — resmi sözleşme belgesi yok.</p>
                )}
              </Card>
            );
          })
        )}

        <p className="pt-2 text-center text-xs text-[var(--color-text-muted)]">
          <Link href="/ogrenci/ayarlar/kvkk" className="font-medium text-emerald-700 hover:underline">
            KVKK Rızalarım
          </Link>
          {" · "}
          <Link href="/ogrenci/ayarlar/foto-video" className="font-medium text-emerald-700 hover:underline">
            Fotoğraf/Video İznim
          </Link>
        </p>
      </main>
    </div>
  );
}
