import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { BackButton } from "@/components/back-button";
import { listStaffTool, listLeaveTool } from "@/lib/services";
import { PageHeader, Card, Badge, Input, Label, Select, Button } from "@/components/ui";
import { actionCreateLeaveRequest, actionDecideLeaveRequest } from "@/lib/actions";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { annual: "Yıllık", sick: "Rapor", unpaid: "Ücretsiz", other: "Diğer" };
const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  pending_approval: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

/** İş 3C — İzin ve devamlılık. */
export default async function IzinlerPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/personel/izinler");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel");

  const kurum = await getInstitutionContext(session);
  const staffResult = await listStaffTool(session, {});
  const staff = staffResult.ok ? staffResult.data.staff : [];
  const leaveResult = await listLeaveTool(session, {});
  const requests = leaveResult.ok ? leaveResult.data.requests : [];
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? id;
  const canWrite = kurum.scope.mode === "single";

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel/personel" label="Personele dön" className="mb-3" />
      <PageHeader title="İzinler" description="Personel izin talepleri ve onay durumu." />

      <Card className="overflow-hidden !p-0">
        {requests.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-text-muted)]">Henüz izin talebi yok.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-4 py-3">Personel</th>
                <th className="px-4 py-3">Tür</th>
                <th className="px-4 py-3">Başlangıç</th>
                <th className="px-4 py-3">Bitiş</th>
                <th className="px-4 py-3">Gün</th>
                <th className="px-4 py-3">Durum</th>
                {canWrite ? <th className="px-4 py-3">İşlem</th> : null}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-2 font-medium text-[var(--color-text)]">{staffName(r.staffId)}</td>
                  <td className="px-4 py-2 text-[var(--color-text-muted)]">{TYPE_LABEL[r.type]}</td>
                  <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.startDate}</td>
                  <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.endDate}</td>
                  <td className="px-4 py-2 text-[var(--color-text-muted)]">{r.dayCount}</td>
                  <td className="px-4 py-2">
                    <Badge status={r.status === "approved" ? "confirmed" : r.status === "rejected" ? "cancelled" : "pending"}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </td>
                  {canWrite ? (
                    <td className="px-4 py-2">
                      {r.status === "pending_approval" || r.status === "draft" ? (
                        <div className="flex gap-1.5">
                          <form
                            action={async () => {
                              "use server";
                              await actionDecideLeaveRequest({ leaveId: r.id, status: "approved" });
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
                              await actionDecideLeaveRequest({ leaveId: r.id, status: "rejected" });
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
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Yeni izin talebi</h2>
          <form
            action={async (formData: FormData) => {
              "use server";
              await actionCreateLeaveRequest(formData);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <Label>Personel</Label>
              <Select name="staffId" required defaultValue="">
                <option value="" disabled>
                  Seçin
                </option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Tür</Label>
              <Select name="type" defaultValue="annual">
                <option value="annual">Yıllık</option>
                <option value="sick">Rapor</option>
                <option value="unpaid">Ücretsiz</option>
                <option value="other">Diğer</option>
              </Select>
            </div>
            <div>
              <Label>Başlangıç</Label>
              <Input name="startDate" type="date" required />
            </div>
            <div>
              <Label>Bitiş</Label>
              <Input name="endDate" type="date" required />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label>Açıklama</Label>
              <Input name="description" placeholder="Opsiyonel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Talep oluştur</Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
