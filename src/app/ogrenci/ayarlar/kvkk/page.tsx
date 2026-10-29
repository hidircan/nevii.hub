import { redirect } from "next/navigation";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { getPortalPageStudentId } from "@/lib/portal-context";
import { getActiveAccessType } from "@/lib/student-portal-access";
import { listKvkkConsentHistoryTool } from "@/lib/services";
import { Badge, Card, PageHeader } from "@/components/ui";
import { actionWithdrawKvkkConsent } from "@/lib/actions";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Faz 8 (KVKK) — konu kendi rıza tarihçesini görebilir + geri çekebilir. */
export default async function OgrenciKvkkPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/ogrenci/ayarlar/kvkk");
  }
  if (session.role !== "STUDENT") redirect("/ogrenci");
  // 10. tur iş #1 — çözümlenmiş aktif öğrenci bağlamı.
  const portalStudentId = await getPortalPageStudentId(session);
  if (!portalStudentId) redirect("/ogrenci");

  const accessType = await getActiveAccessType(session.tenantId, session.userId, portalStudentId);
  const subjectType = accessType === "GUARDIAN" ? "parent" : "student";

  const result = await listKvkkConsentHistoryTool(session, { subjectType, subjectId: portalStudentId });
  const history = result.ok ? result.data.history : [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Rızalarım (KVKK)" description="Verdiğiniz açık rızaların tarihçesi — istediğiniz zaman geri çekebilirsiniz." />

      <Card>
        {history.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Henüz kaydedilmiş bir rızanız yok.</p>
        ) : (
          <div className="space-y-3">
            {history.map((c) => (
              <div key={c.id} className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium text-[var(--color-text)]">{c.consentType}</p>
                  <Badge status={c.withdrawnAt ? "cancelled" : "confirmed"}>
                    {c.withdrawnAt ? "Geri çekildi" : "Onaylı"}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">Onay tarihi: {formatDateTime(c.acceptedAt)}</p>
                {c.withdrawnAt ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Geri çekme: {formatDateTime(c.withdrawnAt)}</p>
                ) : (
                  <form
                    action={async () => {
                      "use server";
                      await actionWithdrawKvkkConsent({ consentId: c.id });
                    }}
                    className="mt-2"
                  >
                    <button
                      type="submit"
                      className="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                    >
                      Rızayı geri çek
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="mt-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <Link href="/ogrenci" className="font-medium hover:underline" style={{ color: "var(--color-primary)" }}>
          ← Öğrenci paneline dön
        </Link>
      </p>
    </div>
  );
}
