import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { BackButton } from "@/components/back-button";
import { listStaffTool, listLeaveTool, listStaffAdvancesTool } from "@/lib/services";
import { Badge, Card, PageHeader } from "@/components/ui";
import { StaffDetailForm } from "@/components/staff-detail-form";
import { StaffPortalAccessCard } from "@/components/portal-access-card";
import { NationalIdReveal } from "@/components/national-id-reveal";
import { StaffIbanReveal } from "@/components/staff-iban-reveal";
import { maskNationalId } from "@/lib/pii/tc-identity";
import { maskIban } from "@/lib/pii/iban";
import { canViewFullNationalId } from "@/lib/pii";
import { formatDate, formatMoney, formatDateTime } from "@/lib/utils";
import {
  actionCreateStaffAdvance,
  actionDecideStaffAdvance,
  actionMarkStaffAdvancePaid,
  actionCancelStaffAdvance,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

const LEAVE_TYPE_LABEL: Record<string, string> = { annual: "Yıllık", sick: "Rapor", unpaid: "Ücretsiz", other: "Diğer" };
const LEAVE_STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  pending_approval: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};
const ADVANCE_STATUS_LABEL: Record<string, string> = {
  pending_approval: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  paid: "Ödendi",
  cancelled: "İptal edildi",
};

/**
 * Faz 9A/9B — personel detay sayfası: tam özlük dosyası (yeni alanlar +
 * TC/IBAN maskeli gösterim+reveal) + izin geçmişi (salt okunur özet,
 * aksiyonlar `/panel/personel/izinler`de) + avanslar (talep/onay/ödeme/
 * iptal burada, tam akış).
 */
export default async function StaffDetailPage({ params }: { params: Promise<{ staffId: string }> }) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/personel");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel");

  const { staffId } = await params;
  const kurum = await getInstitutionContext(session);
  const canWrite = kurum.scope.mode === "single";

  const [staffResult, data, leaveResult, advancesResult] = await Promise.all([
    listStaffTool(session, {}),
    readScopedData(kurum.scope),
    listLeaveTool(session, { staffId }),
    listStaffAdvancesTool(session, { staffId }),
  ]);
  const staff = staffResult.ok ? staffResult.data.staff.find((s) => s.id === staffId) : undefined;
  if (!staff) redirect("/panel/personel");

  const leaves = leaveResult.ok ? leaveResult.data.requests : [];
  const advances = advancesResult.ok ? advancesResult.data.advances : [];
  const canViewSensitive = canViewFullNationalId(session.role);

  const usedThisYearApprovedOrPaid = advances
    .filter((a) => (a.status === "approved" || a.status === "paid") && a.requestDate.startsWith(`${new Date().getFullYear()}-`))
    .reduce((sum, a) => sum + a.amount, 0);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/personel" label="Personele dön" className="mb-3" />
      <PageHeader title={staff.name} description={staff.position} />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Özlük dosyası</h2>
        <Card>
          {canWrite ? (
            <StaffDetailForm staff={staff} branches={data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }))} />
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">Bu görünümde düzenleme kapalı (birleşik kurum görünümü).</p>
          )}
        </Card>
        <Card className="mt-3">
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-[var(--color-text-muted)]">T.C. kimlik no</dt>
              <dd className="mt-1">
                {staff.nationalIdCipher ? (
                  <NationalIdReveal
                    entity="staff"
                    entityId={staff.id}
                    masked={maskNationalId(staff.nationalIdLast2)}
                    canReveal={canViewSensitive}
                  />
                ) : (
                  <span className="text-[var(--color-text-muted)]">Girilmemiş</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[var(--color-text-muted)]">IBAN</dt>
              <dd className="mt-1">
                {staff.ibanCipher ? (
                  <StaffIbanReveal staffId={staff.id} masked={maskIban(staff.ibanLast4)} canReveal={canViewSensitive} />
                ) : (
                  <span className="text-[var(--color-text-muted)]">Girilmemiş</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      {/*
        P0 personel onboarding revizyonu — portal erişim durumu kartı:
        erişim açık mı, atanan rol, davet/aktivasyon durumu, son davet
        tarihi + yeniden gönderme/aç-kapat/sıfırlama. Öğretmen detayındaki
        kartla AYNI desen (bkz. portal-access-card.tsx).
      */}
      <section className="mb-8">
        <StaffPortalAccessCard staffId={staff.id} defaultEmail={staff.email} />
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">İzin geçmişi</h2>
          <Link href="/panel/personel/izinler" className="text-xs font-medium text-[var(--color-primary)] hover:underline">
            Tüm izinleri yönet →
          </Link>
        </div>
        <Card className="overflow-x-auto !p-0">
          {leaves.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-text-muted)]">Henüz izin talebi yok.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Tür</th>
                  <th className="px-4 py-3">Başlangıç</th>
                  <th className="px-4 py-3">Bitiş</th>
                  <th className="px-4 py-3">Gün</th>
                  <th className="px-4 py-3">Durum</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{LEAVE_TYPE_LABEL[r.type]}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.startDate}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.endDate}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.dayCount}</td>
                    <td className="px-4 py-2">
                      <Badge status={r.status === "approved" ? "confirmed" : r.status === "rejected" ? "cancelled" : "pending"}>
                        {LEAVE_STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Avanslar</h2>
        {staff.annualAdvanceLimit !== undefined ? (
          <p className="mb-3 text-xs text-[var(--color-text-muted)]">
            {new Date().getFullYear()} kullanımı: {formatMoney(usedThisYearApprovedOrPaid)} / {formatMoney(staff.annualAdvanceLimit)}
          </p>
        ) : null}
        <Card className="overflow-x-auto !p-0">
          {advances.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-text-muted)]">Henüz avans talebi yok.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Talep tarihi</th>
                  <th className="px-4 py-3">Tutar</th>
                  <th className="px-4 py-3">Açıklama</th>
                  <th className="px-4 py-3">Durum</th>
                  {canWrite ? <th className="px-4 py-3">İşlem</th> : null}
                </tr>
              </thead>
              <tbody>
                {advances.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--color-border)] last:border-0 align-top">
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{formatDate(a.requestDate)}</td>
                    <td className="px-4 py-2 font-medium text-[var(--color-text)]">{formatMoney(a.amount)}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{a.description || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge
                        status={
                          a.status === "paid" || a.status === "approved"
                            ? "confirmed"
                            : a.status === "rejected" || a.status === "cancelled"
                              ? "cancelled"
                              : "pending"
                        }
                      >
                        {ADVANCE_STATUS_LABEL[a.status]}
                      </Badge>
                      {a.approvedAt ? (
                        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">{formatDateTime(a.approvedAt)}</p>
                      ) : null}
                      {a.paidAt ? (
                        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">Ödendi: {formatDateTime(a.paidAt)}</p>
                      ) : null}
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-2">
                        {a.status === "pending_approval" ? (
                          <div className="flex gap-1.5">
                            <form
                              action={async () => {
                                "use server";
                                await actionDecideStaffAdvance({ advanceId: a.id, status: "approved" });
                              }}
                            >
                              <button
                                type="submit"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                              >
                                Onayla
                              </button>
                            </form>
                            <form
                              action={async () => {
                                "use server";
                                await actionDecideStaffAdvance({ advanceId: a.id, status: "rejected" });
                              }}
                            >
                              <button
                                type="submit"
                                className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                              >
                                Reddet
                              </button>
                            </form>
                          </div>
                        ) : a.status === "approved" ? (
                          <div className="flex gap-1.5">
                            <form
                              action={async () => {
                                "use server";
                                await actionMarkStaffAdvancePaid({ advanceId: a.id });
                              }}
                            >
                              <button
                                type="submit"
                                className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                              >
                                Ödendi işaretle
                              </button>
                            </form>
                            <form
                              action={async () => {
                                "use server";
                                await actionCancelStaffAdvance({ advanceId: a.id });
                              }}
                            >
                              <button
                                type="submit"
                                className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                              >
                                İptal et
                              </button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)]">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {canWrite ? (
          <Card className="mt-3">
            <h3 className="mb-3 font-semibold text-[var(--color-text)]">Yeni avans talebi</h3>
            <form
              action={async (formData: FormData) => {
                "use server";
                await actionCreateStaffAdvance(formData);
              }}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <input type="hidden" name="staffId" value={staff.id} />
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Tutar</label>
                <input
                  name="amount"
                  type="number"
                  min={1}
                  required
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-cyan-500/30 focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Talep tarihi</label>
                <input
                  name="requestDate"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-cyan-500/30 focus:ring-2"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Açıklama</label>
                <input
                  name="description"
                  placeholder="Opsiyonel"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-cyan-500/30 focus:ring-2"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  type="submit"
                  className="rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
                >
                  Talep oluştur
                </button>
              </div>
            </form>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
