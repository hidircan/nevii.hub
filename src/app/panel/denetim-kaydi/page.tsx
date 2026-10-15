import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import {
  AUDIT_CATEGORY_ENTITY_TYPES,
  AUDIT_CATEGORY_LABELS,
  AUDIT_SCREEN_LABELS,
  AUDIT_SCREEN_UNKNOWN,
  auditActionOptions,
  auditBreadcrumb,
  auditCategoryOf,
  auditClientInfo,
  compactAuditDiff,
  describeAuditEvent,
  ENTITY_LABELS,
  FIELD_LABELS,
  readAuditChanges,
  ROLE_LABELS_TR,
  type AuditCategory,
} from "@/lib/audit/humanize";
import { resolveActorLabels } from "@/lib/contract-payment-plan-view";
import { AUDITLOG_DELETE_ALLOWLIST, RETENTION_POLICIES } from "@/lib/platform/retention";
import { listAuditActorIds, listAuditLogPage, resolveAuditRowLinks, type AuditOutcome } from "@/lib/audit/log";
import { foldTurkishForSearch } from "@/lib/normalize";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { Card, Input, PageHeader, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL: Record<string, string> = {
  success: "Başarılı",
  denied: "Reddedildi",
  error: "Hata",
};

const ROLE_OPTIONS = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "PARENT", "STUDENT", "AI_AGENT"];
const PAGE_SIZE = 50;

type SearchParams = {
  from?: string;
  to?: string;
  actorUserId?: string;
  actorRole?: string;
  action?: string;
  islem?: string;
  entityType?: string;
  outcome?: string;
  q?: string;
  kategori?: string;
  ozne?: string;
  ozneTuru?: string;
  alan?: string;
  ip?: string;
  sayfa?: string;
};

/** Etiket + kontrol tek `<label>` içinde: ekran okuyucu her filtreyi adıyla okur. */
function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}

/**
 * Denetim Kaydı — kim (işlemi yapan), kimin kaydı (özne), hangi ekranda, ne yaptı, sonuç, ne zaman.
 * 2026-10-15: görünen her sütunun filtresi; saatler İstanbul saatiyle girilir, sunucuda UTC'ye çevrilir
 * (`auditRangeUtc`); filtre + sayfalama sunucuda TEK sorgu (`listAuditLogPage`). Tam kurum okuması yok — adlar
 * referans dilimden, ders/ödeme bağları yalnız görünen satırlar için. Özne yalnız GÜNCEL, bu kapsamdaki
 * öğrenci/öğretmenden aranır — kalıcı silinmiş kişinin adı eski kayıttan seçenek olarak yeniden üretilmez.
 * Filtreler URL'de (paylaşılabilir); "Filtreleri temizle" hepsini kaldırır. Mevcut kayıtlar yeniden yazılmaz.
 */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
  const data = await readScopedReferenceData(kurum.scope);

  const category = sp.kategori && sp.kategori in AUDIT_CATEGORY_LABELS ? (sp.kategori as AuditCategory) : undefined;
  const actionOptions = auditActionOptions();
  const pickedActions = (sp.islem || sp.action || "").split(",").map((a) => a.trim()).filter(Boolean);
  const pickedActionValue = pickedActions.join(",");

  // Özne: ad ile sunucuda aranır; seçili tür yoksa öğrenci + öğretmen. "İşlemi yapan" filtresinden bağımsız.
  const subjectQuery = sp.ozne?.trim() ?? "";
  const subjectFold = foldTurkishForSearch(subjectQuery);
  const subjectMatches = subjectFold
    ? [
        ...(sp.ozneTuru !== "Teacher"
          ? data.students
              .filter((s) => foldTurkishForSearch(s.name).includes(subjectFold))
              .map((s) => ({ id: s.id, name: s.name, kind: "öğrenci" }))
          : []),
        ...(sp.ozneTuru !== "Student"
          ? data.teachers
              .filter((t) => foldTurkishForSearch(t.name).includes(subjectFold))
              .map((t) => ({ id: t.id, name: t.name, kind: "öğretmen" }))
          : []),
      ]
    : [];
  const page = Math.max(1, Number.parseInt(sp.sayfa ?? "1", 10) || 1);

  const { rows: logs, hasMore } =
    subjectFold && subjectMatches.length === 0
      ? { rows: [], hasMore: false }
      : await listAuditLogPage(tenantIds, {
          entityTypes: category && category !== "system" ? AUDIT_CATEGORY_ENTITY_TYPES[category] : undefined,
          excludeEntityTypes: category === "system" ? Object.values(AUDIT_CATEGORY_ENTITY_TYPES).flat() : undefined,
          entityType: sp.entityType || undefined,
          from: sp.from || undefined,
          to: sp.to || undefined,
          actorUserId: sp.actorUserId || undefined,
          actorRole: sp.actorRole || undefined,
          actions: pickedActions.length ? pickedActions : undefined,
          // Her istekte yazılan teknik telemetri (auth.success/refresh) iş kaydı değildir; yalnız açıkça seçilirse gösterilir.
          excludeActions: [...(AUDITLOG_DELETE_ALLOWLIST.api_telemetry ?? [])],
          outcome: (sp.outcome as AuditOutcome) || undefined,
          subjectIds: subjectMatches.map((m) => m.id),
          changedField: sp.alan && sp.alan in FIELD_LABELS ? sp.alan : undefined,
          ip: sp.ip || undefined,
          search: sp.q || undefined,
          page,
          pageSize: PAGE_SIZE,
        });

  const [actorIds, rowLinks] = await Promise.all([listAuditActorIds(tenantIds), resolveAuditRowLinks(tenantIds, logs)]);
  const actorNames = await resolveActorLabels({
    tenantId: session.tenantId,
    userIds: [...actorIds, ...logs.map((l) => l.actorUserId)],
    teachers: data.teachers,
  });
  const branchName = (id?: string) => (id ? data.settings.branches.find((b) => b.id === id)?.shortName : undefined);
  // Özne + şube: kaydın bağlı olduğu güncel öğrenci/öğretmen; bulunamazsa o satırın meta adı (seçenek olmaz), yoksa "—".
  const subjectOf = (entityType: string, entityId: string, meta: Record<string, unknown> | null) => {
    const link = rowLinks.get(entityId);
    const metaStudentId = typeof meta?.studentId === "string" ? meta.studentId : undefined;
    const metaTeacherId = typeof meta?.teacherId === "string" ? meta.teacherId : undefined;
    const studentId = entityType === "Student" ? entityId : (metaStudentId ?? link?.studentId);
    const student = studentId ? data.students.find((st) => st.id === studentId) : undefined;
    const teacherId = entityType === "Teacher" ? entityId : metaTeacherId;
    const teacher = teacherId ? data.teachers.find((t) => t.id === teacherId) : undefined;
    const room = entityType === "Room" ? data.rooms.find((r) => r.id === entityId) : undefined;
    const contractNo = typeof meta?.contractNumber === "string" ? meta.contractNumber : undefined;
    return {
      name: student?.name ?? teacher?.name ?? room?.name ?? (typeof meta?.entityName === "string" ? meta.entityName : undefined),
      kind: student ? "öğrenci" : teacher ? "öğretmen" : ENTITY_LABELS[entityType],
      contract: contractNo ? `Sözleşme #${contractNo}` : undefined,
      branch: branchName(
        typeof meta?.branchId === "string" ? meta.branchId : (link?.branchId ?? student?.branchId ?? teacher?.branchId)
      ),
    };
  };
  const actorOptions = Array.from(new Set(actorIds))
    .map((id) => ({ id, name: actorNames.get(id) ?? "Bilinmeyen kullanıcı" }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase("tr") + s.slice(1);
  const entityTypeOptions = Object.keys(ENTITY_LABELS).sort((a, b) => ENTITY_LABELS[a]!.localeCompare(ENTITY_LABELS[b]!, "tr"));

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v && k !== "sayfa") params.set(k, v);
    if (p > 1) params.set("sayfa", String(p));
    const qs = params.toString();
    return qs ? `/panel/denetim-kaydi?${qs}` : "/panel/denetim-kaydi";
  };
  const hasFilters = Object.entries(sp).some(([k, v]) => k !== "sayfa" && Boolean(v));

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader title="Denetim Kaydı" />

      <Card className="mb-6">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Başlangıç (İstanbul saati)">
            <Input type="datetime-local" name="from" defaultValue={sp.from ?? ""} />
          </Field>
          <Field label="Bitiş (İstanbul saati, dahil)">
            <Input type="datetime-local" name="to" defaultValue={sp.to ?? ""} />
          </Field>
          <Field label="İşlemi yapan">
            <Select name="actorUserId" defaultValue={sp.actorUserId ?? ""}>
              <option value="">Tümü</option>
              {actorOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="İşlemi yapanın rolü">
            <Select name="actorRole" defaultValue={sp.actorRole ?? ""}>
              <option value="">Tümü</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS_TR[r] ?? r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Özne türü">
            <Select name="ozneTuru" defaultValue={sp.ozneTuru ?? ""}>
              <option value="">Öğrenci veya öğretmen</option>
              <option value="Student">Öğrenci</option>
              <option value="Teacher">Öğretmen</option>
            </Select>
          </Field>
          <Field label="Özne (kimin kaydı)">
            <Input name="ozne" defaultValue={sp.ozne ?? ""} placeholder="Öğrenci/öğretmen adı" />
          </Field>
          <Field label="Kayıt türü">
            <Select name="entityType" defaultValue={sp.entityType ?? ""}>
              <option value="">Tümü</option>
              {entityTypeOptions.map((e) => (
                <option key={e} value={e}>
                  {cap(ENTITY_LABELS[e]!)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ekran/modül">
            <Select name="kategori" defaultValue={category ?? ""}>
              <option value="">Tümü</option>
              {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((c) => (
                <option key={c} value={c}>
                  {AUDIT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="İşlem">
            <Select name="islem" defaultValue={pickedActionValue}>
              <option value="">Tümü</option>
              {pickedActionValue && !actionOptions.some((o) => o.value === pickedActionValue) ? (
                <option value={pickedActionValue}>Bağlantıdaki işlem</option>
              ) : null}
              {actionOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sonuç">
            <Select name="outcome" defaultValue={sp.outcome ?? ""}>
              <option value="">Tümü</option>
              <option value="success">Başarılı</option>
              <option value="denied">Reddedildi</option>
              <option value="error">Hata</option>
            </Select>
          </Field>
          <Field label="Değişen bilgi (Önceki → Sonraki)">
            <Select name="alan" defaultValue={sp.alan ?? ""}>
              <option value="">Tümü</option>
              {Object.entries(FIELD_LABELS)
                .sort((a, b) => a[1].localeCompare(b[1], "tr"))
                .map(([field, label]) => (
                  <option key={field} value={field}>
                    {label}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="IP adresi">
            <Input name="ip" defaultValue={sp.ip ?? ""} placeholder="Örn. 85.105" />
          </Field>
          <Field label="Ara (kayıt numarası)" className="sm:col-span-2">
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Kayıt numarası" />
          </Field>
          <div className="col-span-full flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              Filtrele
            </button>
            {hasFilters ? (
              <a
                href="/panel/denetim-kaydi"
                className="rounded-xl border border-[var(--color-border)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"
              >
                Filtreleri temizle
              </a>
            ) : null}
            <span className="text-xs text-[var(--color-text-muted)]">Tüm saatler İstanbul saatidir (TSİ, UTC+3).</span>
          </div>
        </form>
        {subjectFold ? (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]" role="status">
            {subjectMatches.length === 0
              ? `"${subjectQuery}" adında bu kurumda güncel bir öğrenci/öğretmen bulunamadı.`
              : `Özne: ${subjectMatches
                  .slice(0, 5)
                  .map((m) => `${m.name} (${m.kind})`)
                  .join(", ")}${subjectMatches.length > 5 ? ` ve ${subjectMatches.length - 5} kişi daha` : ""}.${subjectMatches.length > 50 ? " İlk 50 kişi aranır; adı daraltın." : ""}`}
          </p>
        ) : null}
      </Card>

      <p className="mb-2 text-xs text-[var(--color-text-muted)]">
        Sayfa {page} · sayfa başına en çok {PAGE_SIZE} kayıt. İş kayıtları (öğrenci, ödeme, sözleşme, hakediş, silme) kalıcı
        saklanır; giriş/oturum kayıtları {RETENTION_POLICIES.security_events.defaultDays} gün, teknik telemetri{" "}
        {RETENTION_POLICIES.api_telemetry.defaultDays} gün sonra platform saklama işiyle temizlenir.
      </p>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-3">Tarih/Saat (TSİ)</th>
              <th className="px-3 py-3">İşlemi yapan</th>
              <th className="px-3 py-3">Rol</th>
              <th className="px-3 py-3">Şube</th>
              <th className="px-3 py-3">Ekran/Modül</th>
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
                  entityName: subject.name,
                  changes,
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
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{screen ?? AUDIT_SCREEN_UNKNOWN}</td>
                    <td className="min-w-[16rem] px-3 py-2.5 text-[var(--color-text)]">
                      <span className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                        {AUDIT_CATEGORY_LABELS[auditCategoryOf(log.entityType)]}
                        {log.outcome !== "success" ? (
                          <span className={log.outcome === "denied" ? " text-amber-700" : " text-rose-700"}>
                            {" · "}
                            {OUTCOME_LABEL[log.outcome] ?? log.outcome}
                          </span>
                        ) : null}
                      </span>
                      {auditBreadcrumb([screen, subject.contract, sentence])}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text)]">
                      {subject.name ?? "—"}
                      {subject.kind ? <span className="block text-[var(--color-text-muted)]">{cap(subject.kind)}</span> : null}
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
      {page > 1 || hasMore ? (
        <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Sayfalama">
          {page > 1 ? (
            <a href={pageHref(page - 1)} className="font-medium text-[var(--color-primary)] hover:underline">
              ← Önceki sayfa
            </a>
          ) : (
            <span />
          )}
          {hasMore ? (
            <a href={pageHref(page + 1)} className="font-medium text-[var(--color-primary)] hover:underline">
              Sonraki sayfa →
            </a>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
