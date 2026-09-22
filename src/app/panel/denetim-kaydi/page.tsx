import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import { describeAuditEvent, ENTITY_LABELS, fieldLabel, formatAuditValue, readAuditChanges, ROLE_LABELS_TR } from "@/lib/audit/humanize";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { AUDITLOG_DELETE_ALLOWLIST, RETENTION_POLICIES } from "@/lib/platform/retention";
import { listAuditLogs, type AuditOutcome } from "@/lib/audit/log";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { Card, Input, Label, PageHeader, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL: Record<string, string> = {
  success: "Başarılı",
  denied: "Reddedildi",
  error: "Hata",
};

const ROLE_OPTIONS = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT", "AI_AGENT"];

/**
 * Denetim Kaydı — kim, ne zaman, hangi ekranda/varlıkta hangi kritik
 * işlemi yaptı (audit trail). Veri kaynağı `src/lib/audit/log.ts`
 * (recordAuditLog/listAuditLogs) — tüm kritik yazma işlemlerinde zaten
 * çağrılıyordu. Yalnızca STORE_MODE=db'de kalıcı olur; json/memory modda
 * boş liste döner, hata fırlatmaz.
 *
 * Filtreler URL query param'larında tutulur (?from=&to=&actorUserId=&
 * actorRole=&action=&entityType=&outcome=&q=) — kalıcı, paylaşılabilir ve
 * geri/ileri tuşlarıyla uyumlu (theme/sidebar tercihi gibi localStorage
 * değil, bilinçli olarak URL — bir denetim sorgusu link olarak
 * paylaşılabilmeli).
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    actorUserId?: string;
    actorRole?: string;
    action?: string;
    entityType?: string;
    outcome?: string;
    q?: string;
  }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/denetim-kaydi");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const sp = await searchParams;
  const tenantIds = kurum.scope.mode === "all" ? kurum.scope.tenantIds : [kurum.scope.tenantId];

  const filters = {
    from: sp.from || undefined,
    to: sp.to || undefined,
    actorUserId: sp.actorUserId || undefined,
    actorRole: sp.actorRole || undefined,
    action: sp.action || undefined,
    entityType: sp.entityType || undefined,
    outcome: (sp.outcome as AuditOutcome) || undefined,
    search: sp.q || undefined,
    // Her kimlik doğrulamalı istekte yazılan teknik telemetri (auth.success/refresh) iş kaydı değildir;
    // yalnız işlem kodu açıkça seçilirse gösterilir.
    excludeActions: [...(AUDITLOG_DELETE_ALLOWLIST.api_telemetry ?? [])],
    limit: 200,
  };

  const perTenantLogs = await Promise.all(tenantIds.map((tid) => listAuditLogs(tid, filters)));
  const logs = perTenantLogs.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);

  // İnsan okunur: kişi adı + varlık adı çözümü (ham kimlik gösterilmez).
  const data = await readScopedData(kurum.scope);
  const actorNames = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: logs.map((l) => l.actorUserId),
    teachers: data.teachers,
  });
  const entityNameOf = (entityType: string, entityId: string, meta: Record<string, unknown> | null): string | undefined => {
    if (typeof meta?.entityName === "string") return meta.entityName;
    if (entityType === "Student") return data.students.find((st) => st.id === entityId)?.name;
    if (entityType === "Teacher") return data.teachers.find((t) => t.id === entityId)?.name;
    return undefined;
  };
  const actorOptions = Array.from(new Set(logs.map((l) => l.actorUserId)))
    .map((id) => ({ id, name: actorNames.get(id) ?? "Bilinmeyen kullanıcı" }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  const actionOptions = Array.from(new Set(logs.map((l) => l.action))).sort();
  const entityTypeOptions = Array.from(new Set(logs.map((l) => l.entityType))).sort();

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader title="Denetim Kaydı" />

      <Card className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Başlangıç tarihi</Label>
            <Input type="date" name="from" defaultValue={sp.from ?? ""} />
          </div>
          <div>
            <Label>Bitiş tarihi</Label>
            <Input type="date" name="to" defaultValue={sp.to ?? ""} />
          </div>
          <div>
            <Label>Kişi</Label>
            <Select name="actorUserId" defaultValue={sp.actorUserId ?? ""}>
              <option value="">Tümü</option>
              {actorOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Rol</Label>
            <Select name="actorRole" defaultValue={sp.actorRole ?? ""}>
              <option value="">Tümü</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS_TR[r] ?? r}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>İşlem kodu (gelişmiş)</Label>
            <Input name="action" list="action-options" defaultValue={sp.action ?? ""} placeholder="ör. payment.mark_paid" />
            <datalist id="action-options">
              {actionOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Kayıt türü</Label>
            <Select name="entityType" defaultValue={sp.entityType ?? ""}>
              <option value="">Tümü</option>
              {Array.from(new Set([...entityTypeOptions, ...(sp.entityType ? [sp.entityType] : [])])).map((e) => (
                <option key={e} value={e}>
                  {ENTITY_LABELS[e] ? ENTITY_LABELS[e].charAt(0).toLocaleUpperCase("tr") + ENTITY_LABELS[e].slice(1) : e}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Durum</Label>
            <Select name="outcome" defaultValue={sp.outcome ?? ""}>
              <option value="">Tümü</option>
              <option value="success">Başarılı</option>
              <option value="denied">Reddedildi</option>
              <option value="error">Hata</option>
            </Select>
          </div>
          <div>
            <Label>Ara</Label>
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="İşlem kodu veya kayıt no..." />
          </div>
          <div className="col-span-full flex items-center gap-2">
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              Filtrele
            </button>
            <a
              href="/panel/denetim-kaydi"
              className="rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
            >
              Temizle
            </a>
          </div>
        </form>
      </Card>

      <p className="mb-2 text-xs text-[var(--color-text-muted)]">
        Son {logs.length} kayıt gösteriliyor. İş kayıtları (öğrenci, ödeme, sözleşme, hakediş, silme) kalıcı saklanır; giriş/oturum
        kayıtları {RETENTION_POLICIES.security_events.defaultDays} gün, teknik telemetri {RETENTION_POLICIES.api_telemetry.defaultDays} gün
        sonra platform saklama işiyle temizlenir.
      </p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-3">Zaman</th>
              <th className="px-4 py-3">Kişi</th>
              <th className="px-4 py-3">Ne yapıldı</th>
              <th className="px-4 py-3">Sonuç</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Bu filtrelerle eşleşen denetim kaydı yok.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const actorName = actorNames.get(log.actorUserId) ?? "Bilinmeyen kullanıcı";
                const changes = readAuditChanges(log.meta);
                return (
                  <tr key={log.id} className="border-b border-[var(--color-border)] align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-text-muted)]">
                      {formatDateTime(log.createdAt.toISOString())}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-[var(--color-text)]">{actorName}</span>
                      <span className="block text-xs text-[var(--color-text-muted)]">{ROLE_LABELS_TR[log.actorRole] ?? log.actorRole}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text)]" title={`Teknik kod: ${log.action} · ${log.entityType}`}>
                      {describeAuditEvent({
                        action: log.action,
                        entityType: log.entityType,
                        actorName,
                        entityName: entityNameOf(log.entityType, log.entityId, log.meta),
                      })}
                      {changes.length > 0 ? (
                        <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                          {changes
                            .slice(0, 4)
                            .map((c) => `${fieldLabel(c.field)}: ${formatAuditValue(c.from)} → ${formatAuditValue(c.to)}`)
                            .join(" · ")}
                          {changes.length > 4 ? ` · +${changes.length - 4} alan` : ""}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          log.outcome === "success"
                            ? "font-medium text-emerald-700"
                            : log.outcome === "denied"
                              ? "font-medium text-amber-700"
                              : "font-medium text-rose-700"
                        }
                      >
                        {OUTCOME_LABEL[log.outcome] ?? log.outcome}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
