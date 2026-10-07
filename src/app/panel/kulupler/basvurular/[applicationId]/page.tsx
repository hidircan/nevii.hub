import Link from "@/components/link";
import { notFound, redirect } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ClubApplicationAddToClub, ClubApplicationStatusEditor } from "@/components/club-application-admin";
import { ClubApplicationStatusBadge } from "@/components/club-application-status-badge";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { CLUB_AUDIENCE_LABEL, CLUB_FEE_PERIOD_LABEL } from "@/lib/clubs";
import { formatPhone, getClubApplicationTool, normalizePhone, type ClubOffer } from "@/lib/club-applications";
import { readReferenceData } from "@/lib/store";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ymdTr = (ymd?: string) => (ymd ? ymd.split("-").reverse().join(".") : "—");

function OfferRows({ o }: { o: ClubOffer }) {
  const rows: [string, string][] = [
    ["Kulüp", `${o.name} · ${o.instrument}${o.audience ? ` · ${CLUB_AUDIENCE_LABEL[o.audience]}` : ""}`],
    ["Ücret", `${formatMoney(o.fee)} / ${CLUB_FEE_PERIOD_LABEL[o.feePeriod]}`],
    ["Dönem", `${ymdTr(o.startDate)} – ${ymdTr(o.endDate)}`],
    ["Gün/saat · süre", `${o.scheduleText ? `${o.scheduleText} · ` : ""}${o.durationMinutes} dk`],
    ["Şube", o.branchName ?? "—"],
    ["Ücrete dahil", [o.includesText, o.includedSolfege ? `Dahil solfej: ${o.includedSolfege.name}` : ""].filter(Boolean).join(" · ") || "—"],
  ];
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs text-[var(--color-text-muted)]">{k}</dt>
          <dd className="whitespace-pre-line">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 2026-10-07 — Grup dersi başvurusu detayı: aday/veli, talep edilen kulüp (başvuru anı + güncel fark), durum, Kulübe ekle. */
export default async function KulupBasvuruDetayPage({
  params,
  searchParams,
}: {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{ ogrenci?: string }>;
}) {
  const { applicationId } = await params;
  const { ogrenci } = await searchParams;
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/panel/kulupler/basvurular/${applicationId}`);
  }
  const kurum = await getInstitutionContext(session);
  if (kurum.scope.mode !== "single" || kurum.scope.tenantId !== session.tenantId) redirect("/panel/kulupler/basvurular");
  const res = await getClubApplicationTool(session, { id: applicationId });
  if (!res.ok) {
    if (res.error.code === "NOT_FOUND") notFound();
    return (
      <div>
        <PageHeader title="Grup dersi başvurusu" />
        <EmptyState title="Bu ekrana erişiminiz yok" description={res.error.message} />
      </div>
    );
  }
  const { application: a, currentOffer, offerDiff, related } = res.data;
  const ref = await readReferenceData();
  const students = ref.students
    .filter((s) => !s.deletedAt)
    .sort((x, y) => x.name.localeCompare(y.name, "tr"))
    .map((s) => ({ id: s.id, name: s.name, phone: s.parentPhone || s.phone || undefined, birthDate: s.birthDate || undefined, active: s.active !== false }));
  const nameKey = a.participantName.trim().toLocaleLowerCase("tr");
  const suggestions = ref.students
    .filter((s) => !s.deletedAt)
    .map((s) => {
      const phones = [s.phone, s.parentPhone].filter(Boolean).map((p) => normalizePhone(String(p)));
      const samePhone = phones.includes(a.phone);
      const sameName = s.name.trim().toLocaleLowerCase("tr") === nameKey;
      const reason = samePhone && sameName ? "Aynı ad ve telefon" : samePhone ? "Aynı telefon (kardeş/veli olabilir)" : sameName ? "Aynı ad (farklı kişi olabilir)" : "";
      return { id: s.id, name: s.name, phone: s.parentPhone || s.phone || undefined, birthDate: s.birthDate || undefined, active: s.active !== false, reason, score: (samePhone ? 2 : 0) + (sameName ? 1 : 0) };
    })
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 8)
    .map(({ score: _s, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
  const linkedStudent = a.studentId ? ref.students.find((s) => s.id === a.studentId) : undefined;
  const preselect = (ogrenci && students.some((s) => s.id === ogrenci) ? ogrenci : undefined) ?? a.studentId;
  const clubName = (id: string) => (id === a.clubId ? a.clubSnapshot.name : "başka kulüp");

  return (
    <div className="space-y-5">
      <Link href="/panel/kulupler/basvurular" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">← Başvurular</Link>
      <PageHeader title={a.participantName} description={`${a.reference} · ${formatDateTime(a.createdAt)} · ${a.clubSnapshot.name}`} actions={<ClubApplicationStatusBadge status={a.status} />} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Aday {a.parentName ? "ve veli" : ""}</h2>
            <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="text-xs text-[var(--color-text-muted)]">Katılımcı</dt>
              <dd>{a.participantName}</dd>
              <dt className="text-xs text-[var(--color-text-muted)]">Doğum / yaş</dt>
              <dd>{a.birthDate ? `${ymdTr(a.birthDate)}${a.age !== undefined ? ` (${a.age} yaş)` : ""}` : a.age !== undefined ? `${a.age} yaş` : "—"}</dd>
              {a.parentName ? (
                <>
                  <dt className="text-xs text-[var(--color-text-muted)]">Veli</dt>
                  <dd>{a.parentName}</dd>
                </>
              ) : null}
              <dt className="text-xs text-[var(--color-text-muted)]">{a.parentName ? "Veli telefonu" : "Telefon"}</dt>
              <dd>
                <a href={`tel:${a.phone}`} className="tabular-nums text-[var(--color-primary)] hover:underline">{formatPhone(a.phone)}</a>
              </dd>
              <dt className="text-xs text-[var(--color-text-muted)]">E-posta</dt>
              <dd>{a.email ? <a href={`mailto:${a.email}`} className="text-[var(--color-primary)] hover:underline">{a.email}</a> : "—"}</dd>
              <dt className="text-xs text-[var(--color-text-muted)]">Not</dt>
              <dd className="whitespace-pre-line break-words">{a.note ?? "—"}</dd>
              <dt className="text-xs text-[var(--color-text-muted)]">KVKK onayı</dt>
              <dd className="text-xs">{formatDateTime(a.kvkkConsentAt)}{a.kvkkTextVersionId ? " (kurum metni)" : " (varsayılan metin)"}</dd>
              {a.source ? (
                <>
                  <dt className="text-xs text-[var(--color-text-muted)]">Kaynak</dt>
                  <dd className="text-xs">{a.source}</dd>
                </>
              ) : null}
            </dl>
            {related.length ? (
              <div className="mt-3 rounded-md bg-[var(--color-surface-muted)] px-3 py-2 text-xs">
                <p className="font-semibold">Aynı telefonla {related.length} başka başvuru (kardeş olabilir — engellenmedi):</p>
                <ul className="mt-1 space-y-0.5">
                  {related.map((r) => (
                    <li key={r.id}>
                      <Link href={`/panel/kulupler/basvurular/${r.id}`} className="text-[var(--color-primary)] hover:underline">
                        {r.reference} · {r.participantName}
                      </Link>{" "}
                      · {clubName(r.clubId)} · {formatDateTime(r.createdAt)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Talep edilen kulüp — başvuru anındaki teklif</h2>
            <OfferRows o={a.clubSnapshot} />
            {a.waitlistRequested ? <p className="mt-2 text-xs text-[var(--color-warning)]">Başvuru, kontenjan doluyken bekleme listesi için yapıldı.</p> : null}
            {offerDiff.length ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-[var(--color-warning)]">Kulüp başvurudan sonra değişti — eski teklif ve güncel fark:</p>
                <table className="mt-1 w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--color-text-muted)]">
                      <th className="py-1 pr-2 font-medium">Alan</th>
                      <th className="py-1 pr-2 font-medium">Başvuru anında</th>
                      <th className="py-1 font-medium">Şimdi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offerDiff.map((d) => (
                      <tr key={d.field} className="border-t border-[var(--color-border)]">
                        <td className="py-1 pr-2">{d.field}</td>
                        <td className="py-1 pr-2">{d.then}</td>
                        <td className="py-1 font-medium">{d.now}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : currentOffer ? (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">Kulüp bilgileri başvurudan beri değişmedi.</p>
            ) : null}
            <Link href={`/panel/kulupler/${a.clubId}`} className="mt-3 inline-block text-xs font-semibold text-[var(--color-primary)] hover:underline">Kulübe git →</Link>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Durum</h2>
            <ClubApplicationStatusEditor id={a.id} status={a.status} staffNote={a.staffNote} />
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Kulübe ekle</h2>
            {a.status === "added" && !a.solfegePending ? (
              <p className="text-sm">
                Kulübe eklendi
                {linkedStudent ? (
                  <>
                    : <Link href={`/panel/ogrenciler/${linkedStudent.id}`} className="font-medium text-[var(--color-primary)] hover:underline">{linkedStudent.name}</Link>
                  </>
                ) : null}
                . Üyelik ve ücret işlemleri <Link href={`/panel/kulupler/${a.clubId}`} className="text-[var(--color-primary)] hover:underline">kulüp ekranından</Link> yürür.
              </p>
            ) : (
              <>
                {linkedStudent && a.status !== "added" ? (
                  <p className="mb-2 rounded-md bg-[var(--color-info-soft)] px-3 py-2 text-xs text-[var(--color-info)]">
                    Bu başvurudan öğrenci kaydı açıldı: <strong>{linkedStudent.name}</strong>. Önizleyip kulübe ekleyin.
                  </p>
                ) : null}
                <ClubApplicationAddToClub
                  applicationId={a.id}
                  students={students}
                  suggestions={suggestions}
                  initialStudentId={preselect}
                  newStudentHref={`/panel/ogrenciler/yeni?kulupBasvuru=${encodeURIComponent(a.id)}`}
                  solfegeOnly={a.status === "added" && a.solfegePending}
                />
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
