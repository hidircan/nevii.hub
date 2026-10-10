import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import {
  AUDIT_CATEGORY_ENTITY_TYPES,
  AUDIT_CATEGORY_LABELS,
  AUDIT_SCREEN_LABELS,
  auditBreadcrumb,
  auditCategoryOf,
  auditClientInfo,
  compactAuditDiff,
  describeAuditEvent,
  ENTITY_LABELS,
  readAuditChanges,
  ROLE_LABELS_TR,
  type AuditCategory,
} from "@/lib/audit/humanize";
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
    kategori?: string;
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

  const category = sp.kategori && sp.kategori in AUDIT_CATEGORY_LABELS ? (sp.kategori as AuditCategory) : undefined;
  const filters = {
    entityTypes: category && category !== "system" ? AUDIT_CATEGORY_ENTITY_TYPES[category] : undefined,
    excludeEntityTypes: category === "system" ? Object.values(AUDIT_CATEGORY_ENTITY_TYPES).flat() : undefined,
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
    if (entityType === "Room") return data.rooms.find((r) => r.id === entityId)?.name;
    return undefined;
  };
  // 8. tur (F) — Özne + şube: kaydın bağlı olduğu öğrenci/öğretmen (meta'dan ya da
  // ders/ödeme satırından). Bulunamayan parça gösterilmez, uydurulmaz.
  const branchName = (id?: string) => (id ? data.settings.branches.find((b) => b.id === id)?.shortName : undefined);
  const subjectOf = (entityType: string, entityId: string, meta: Record<string, unknown> | null) => {
    const metaStudentId = typeof meta?.studentId === "string" ? meta.studentId : undefined;
    const lesson = entityType === "Lesson" ? data.lessons.find((l) => l.id === entityId) : undefined;
    const payment = entityType === "Payment" ? data.payments.find((p) => p.id === entityId) : undefined;
    const studentId = entityType === "Student" ? entityId : (metaStudentId ?? lesson?.studentId ?? payment?.studentId);
    const student = studentId ? data.students.find((st) => st.id === studentId) : undefined;
    const teacher = entityType === "Teacher" ? data.teachers.find((t) => t.id === entityId) : undefined;
    const contractNo =
      typeof meta?.contractNumber === "string" ? meta.contractNumber : undefined;
    return {
      name: student?.name ?? teacher?.name ?? entityNameOf(entityType, entityId, meta),
      contract: contractNo ? `Sözleşme #${contractNo}` : undefined,
      branch: branchName(
        typeof meta?.branchId === "string" ? meta.branchId : (lesson?.branchId ?? student?.branchId ?? teacher?.branchId)
      ),
    };
  };
  const actorOptions = Array.from(new Set(logs.map((l) => l.actorUserId)))
    .map((id) => ({ id, name: actorNames.get(id) ?? "Bilinmeyen kullanıcı" }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

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
            <Label>İşlem türü</Label>
            <Select name="kategori" defaultValue={category ?? ""}>
              <option value="">Tümü</option>
              {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((c) => (
                <option key={c} value={c}>
                  {AUDIT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
            {sp.action ? <input type="hidden" name="action" value={sp.action} /> : null}
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
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Kayıt no veya kişi kimliği..." />
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
              <th className="px-3 py-3">Tarih/Saat</th>
              <th className="px-3 py-3">Kullanıcı</th>
              <th className="px-3 py-3">Rol</th>
              <th className="px-3 py-3">Şube</th>
              <th className="px-3 py-3">Ekran/Bölüm</th>
              <th className="px-3 py-3">İşlem</th>
              <th className="px-3 py-3">Özne</th>
              <th className="px-3 py-3">Önceki → Sonraki</th>
              <th className="px-3 py-3">IP/Cihaz</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Bu filtrelerle eşleşen denetim kaydı yok.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const actorName = actorNames.get(log.actorUserId) ?? "Bilinmeyen kullanıcı";
                const changes = readAuditChanges(log.meta);
                const subject = subjectOf(log.entityType, log.entityId, log.meta);
                const screen = AUDIT_SCREEN_LABELS[log.entityType];
                const sentence = describeAuditEvent({
                  action: log.action,
                  entityType: log.entityType,
                  outcome: log.outcome,
                  actorName,
                  entityName: entityNameOf(log.entityType, log.entityId, log.meta),
                });
                const diff = compactAuditDiff(changes);
                return (
                  <tr key={log.id} className="border-b border-[var(--color-border)] align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-text-muted)]">
                      {formatDateTime(log.createdAt.toISOString())}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[var(--color-text)]">{actorName}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{ROLE_LABELS_TR[log.actorRole] ?? log.actorRole}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{subject.branch ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{screen ?? "—"}</td>
                    <td className="min-w-[16rem] px-3 py-2.5 text-[var(--color-text)]" title={`Teknik kod: ${log.action} · ${log.entityType}`}>
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                        {AUDIT_CATEGORY_LABELS[auditCategoryOf(log.entityType)]}
                        {log.outcome !== "success" ? (
                          <span className={log.outcome === "denied" ? " text-amber-700" : " text-rose-700"}>
                            {" · "}
                            {OUTCOME_LABEL[log.outcome] ?? log.outcome}
                          </span>
                        ) : null}
                      </span>
                      {auditBreadcrumb([screen, subject.name, subject.contract, sentence])}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text)]">
                      {subject.name ?? "—"}
                      {subject.contract ? <span className="block text-[var(--color-text-muted)]">{subject.contract}</span> : null}
                    </td>
                    <td className="min-w-[12rem] px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{diff || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{auditClientInfo(log.meta) ?? "—"}</td>
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
